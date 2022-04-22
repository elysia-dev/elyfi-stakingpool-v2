import { BigNumber, ethers, utils } from 'ethers';
import { waffle } from 'hardhat';
import { expect } from 'chai';
import TestEnv from './types/TestEnv';
import { RAY, SECONDSPERDAY } from './utils/constants';
import { setTestEnv } from './utils/testEnv';
import { advanceTimeTo, getTimestamp, toTimestamp } from './utils/time';
import { expectDataAfterStake, expectDataAfterWithdraw, updatePoolData } from './utils/expect';
import { createTestActions, getPoolData, getUserData, TestHelperActions } from './utils/helpers';

const { loadFixture } = waffle;

require('./utils/matchers.ts');

describe('StakingPool.withdraw', () => {
  let testEnv: TestEnv;
  let actions: TestHelperActions;

  const provider = waffle.provider;
  const [deployer, alice, bob] = provider.getWallets();

  const rewardPersecond = BigNumber.from(utils.parseEther('1'));
  const year = BigNumber.from(2022);
  const month_1 = BigNumber.from(7);
  const day_1 = BigNumber.from(8);
  const duration = BigNumber.from(30).mul(SECONDSPERDAY);

  const month_2 = BigNumber.from(7);
  const day_2 = BigNumber.from(20);

  const firstTimestamp = toTimestamp(year, month_1, day_1, BigNumber.from(10));
  const secondTimestamp = toTimestamp(year, month_2, day_2, BigNumber.from(10));
  const amount = ethers.utils.parseEther('1');
  const newRewardPersecond = BigNumber.from(utils.parseEther('2'));

  async function fixture() {
    return await setTestEnv();
  }

  after(async () => {
    await loadFixture(fixture);
  });

  beforeEach('deploy staking pool', async () => {
    testEnv = await loadFixture(fixture);
    actions = createTestActions(testEnv);
    await actions.faucetAndApproveReward(deployer, RAY);
    await actions.faucetAndApproveTarget(alice, RAY);
  });

  it('reverts if the pool is before initiation', async () => {
    await expect(
      testEnv.stakingPool.connect(alice).withdraw(amount)
    ).to.be.revertedWith('StakingNotInitiated');
  });

  context('when the pool initiated', async () => {
    beforeEach('deploy staking pool and init pool', async () => {
      await actions.initNewPoolAndTransfer(deployer, rewardPersecond, firstTimestamp, duration);
      await actions.faucetAndApproveTarget(bob, RAY);
    });

    it('reverts if withdraws amount exceeds principal', async () => {
      await expect(
        testEnv.stakingPool.connect(alice).withdraw(amount)
      ).to.be.revertedWith('NotEnoughPrincipal');
    });

    context('when alice stakes and time passes', async () => {
      const stakeAmount = utils.parseEther('1');

      beforeEach('', async () => {
        await advanceTimeTo(firstTimestamp);
        await actions.stake(alice, stakeAmount);
      });

      it('alice withdraws all', async () => {
        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);

        const withdrawTx = await actions.withdraw(alice, stakeAmount);

        const [expectedPoolData, expectedUserData] = expectDataAfterWithdraw(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(withdrawTx),
          stakeAmount
        );

        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
        expect(userDataAfter).to.be.equalUserData(expectedUserData);
      });

      it('alice withdraw all and stake again', async () => {
        await actions.withdraw(alice, stakeAmount);

        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);

        const stakeTx = await actions.stake(alice, stakeAmount);

        const [expectedPoolData, expectedUserData] = expectDataAfterStake(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(stakeTx),
          stakeAmount
        );

        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
        expect(userDataAfter).to.be.equalUserData(expectedUserData);
      });

      it('first stake, second stake from alice, and withdraw max', async () => {
        await testEnv.stakingPool.connect(alice).stake(stakeAmount);
        await testEnv.stakingPool.connect(alice).stake(stakeAmount);

        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);

        const withdrawAllTx = await testEnv.stakingPool
          .connect(alice)
          .withdraw(ethers.constants.MaxUint256);

        const [expectedPoolData, expectedUserData] = expectDataAfterWithdraw(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(withdrawAllTx),
          ethers.constants.MaxUint256,
        );

        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
        expect(userDataAfter).to.be.equalUserData(expectedUserData);
      });

      it('alice and bob stake, and alice withdraws partial', async () => {
        await testEnv.stakingPool.connect(alice).stake(stakeAmount.mul(2));
        await testEnv.stakingPool.connect(bob).stake(stakeAmount);

        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);

        const withdrawTx = await testEnv.stakingPool
          .connect(alice)
          .withdraw(stakeAmount);

        const [expectedPoolData, expectedUserData] = expectDataAfterWithdraw(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(withdrawTx),
          stakeAmount
        );

        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
        expect(userDataAfter).to.be.equalUserData(expectedUserData);
      });
    });

    context('withdraw after pool is closed', async () => {
      beforeEach('owner close pool', async () => {
        await testEnv.stakingAsset.connect(alice).approve(testEnv.stakingPool.address, RAY);
        await advanceTimeTo(firstTimestamp);

        await testEnv.stakingPool.connect(alice).stake(amount.mul(2));
        await testEnv.stakingPool.connect(deployer).closePool();
        await advanceTimeTo(secondTimestamp);
      })

      it('reverts if withdraws amount exceeds principal', async () => {
        await expect(
          testEnv.stakingPool.connect(alice).withdraw(amount.mul(3))
        ).to.be.revertedWith('NotEnoughPrincipal');
      });

      it('alice withdraws all', async () => {
        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);

        const withdrawTx = await testEnv.stakingPool
          .connect(alice)
          .withdraw(amount.mul(2));

        const [expectedPoolData, expectedUserData] = expectDataAfterWithdraw(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(withdrawTx),
          amount.mul(2)
        );
        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
        expect(userDataAfter).to.be.equalUserData(expectedUserData);
      });


      it('revert if alice withdraws and stakes', async () => {
        await testEnv.stakingPool.connect(alice).withdraw(amount);
        await expect(testEnv.stakingPool.connect(alice).stake(amount)
        ).to.be.revertedWith('Closed');
      });


      it('alice withdraws partial', async () => {
        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);

        const withdrawTx = await testEnv.stakingPool
          .connect(alice)
          .withdraw(amount);

        const [expectedPoolData, expectedUserData] = expectDataAfterWithdraw(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(withdrawTx),
          amount
        );

        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
        expect(userDataAfter).to.be.equalUserData(expectedUserData);
      });
    });

    context('rewardPerSecond is changed', async () => {
      beforeEach('deploy staking pool and init pool', async () => {
        await actions.initNewPoolAndTransfer(deployer, rewardPersecond, firstTimestamp, duration);
        await advanceTimeTo(firstTimestamp);
        await testEnv.stakingPool.connect(alice).stake(amount.mul(3));
      });

      it('rewardPerSecond is changed and withdraw all', async () => {
        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);
        const tx = await testEnv.stakingPool.connect(deployer).extendPool(newRewardPersecond, duration);

        const [expectedPoolData_1, expectedUserData_1] = updatePoolData(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(tx),
          duration,
          newRewardPersecond
        );

        const withdrawTx = await testEnv.stakingPool
          .connect(alice)
          .withdraw(amount.mul(3));

        const [expectedPoolData_2, expectedUserData_2] = expectDataAfterWithdraw(
          expectedPoolData_1,
          expectedUserData_1,
          await getTimestamp(withdrawTx),
          amount.mul(3)
        );
        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).eql(expectedPoolData_2);
        expect(userDataAfter).eql(expectedUserData_2);
      });

      it('rewardPerSecond is changed and withdraw partial', async () => {
        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);
        const tx = await testEnv.stakingPool.connect(deployer).extendPool(newRewardPersecond, duration);


        const [expectedPoolData_1, expectedUserData_1] = updatePoolData(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(tx),
          duration,
          newRewardPersecond
        );

        const withdrawTx = await testEnv.stakingPool
          .connect(alice)
          .withdraw(amount);

        const [expectedPoolData_2, expectedUserData_2] = expectDataAfterWithdraw(
          expectedPoolData_1,
          expectedUserData_1,
          await getTimestamp(withdrawTx),
          amount
        );
        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).eql(expectedPoolData_2);
        expect(userDataAfter).eql(expectedUserData_2);
      });

      it('rewardPerSecond is changed and stake and withdraw', async () => {
        const poolDataBeforeStake = await getPoolData(testEnv);
        const userDataBeforeStake = await getUserData(testEnv, alice);
        const tx = await testEnv.stakingPool.connect(deployer).extendPool(newRewardPersecond, duration);


        const [expectedPoolData, expectedUserData] = updatePoolData(
          poolDataBeforeStake,
          userDataBeforeStake,
          await getTimestamp(tx),
          duration,
          newRewardPersecond
        );

        const stakeTx = await testEnv.stakingPool.connect(alice).stake(amount.mul(2));
        const [expectedPoolDataStake, expectedUserDataStake] = expectDataAfterStake(
          expectedPoolData,
          expectedUserData,
          await getTimestamp(stakeTx),
          amount.mul(2)
        );

        const poolDataAfterStake = await getPoolData(testEnv);
        const userDataAfterStake = await getUserData(testEnv, alice);

        expect(poolDataAfterStake).eql(expectedPoolDataStake);
        expect(userDataAfterStake).eql(expectedUserDataStake);

        // withdraw test
        const poolDataBeforeWithdraw = await getPoolData(testEnv);
        const userDataBeforeWithdraw = await getUserData(testEnv, alice);
        const withdrawTx = await testEnv.stakingPool.connect(alice).withdraw(amount);
        const [expectedPoolDataWithdraw, expectedUserDataWithdraw] = expectDataAfterWithdraw(
          poolDataBeforeWithdraw,
          userDataBeforeWithdraw,
          await getTimestamp(withdrawTx),
          amount
        );
        const poolDataAfterWithdraw = await getPoolData(testEnv);
        const userDataAfterWithdraw = await getUserData(testEnv, alice);

        expect(poolDataAfterWithdraw).eql(expectedPoolDataWithdraw);
        expect(userDataAfterWithdraw).eql(expectedUserDataWithdraw);
      });


      context('when admin sets bob as a manager', async () => {
        it('bob becomes a manager and extend the pool and alice withdraw', async () => {
          await actions.faucetAndApproveTarget(bob, RAY);
          const poolDataBefore = await getPoolData(testEnv);
          const userDataBefore = await getUserData(testEnv, alice);
          await testEnv.stakingPool.setManager(bob.address);

          await advanceTimeTo(secondTimestamp)
          const tx = await testEnv.stakingPool.connect(bob).extendPool(newRewardPersecond, duration);
          const [expectedPoolData_1, expectedUserData_1] = updatePoolData(
            poolDataBefore,
            userDataBefore,
            await getTimestamp(tx),
            duration,
            newRewardPersecond
          );

          const withdrawTx = await testEnv.stakingPool.connect(alice).withdraw(amount);
          const [expectedPoolData_2, expectedUserData_2] = expectDataAfterWithdraw(
            expectedPoolData_1,
            expectedUserData_1,
            await getTimestamp(withdrawTx),
            amount
          );

          const poolDataAfter = await getPoolData(testEnv);
          const userDataAfter = await getUserData(testEnv, alice);

          expect(poolDataAfter).eql(expectedPoolData_2);
          expect(userDataAfter).eql(expectedUserData_2);
        });

        it('alice action and bob becomes manager and call extend pool ', async () => {
          await testEnv.stakingPool.connect(alice).stake(amount);
          await actions.faucetAndApproveTarget(bob, RAY);
          await testEnv.stakingPool.setManager(bob.address);

          await advanceTimeTo(secondTimestamp);
          await testEnv.stakingPool.connect(alice).claim();
          const poolDataBefore = await getPoolData(testEnv);
          const userDataBefore = await getUserData(testEnv, alice);

          const tx = await testEnv.stakingPool.connect(bob).extendPool(newRewardPersecond, duration);
          const [expectedPoolData_1, expectedUserData_1] = updatePoolData(
            poolDataBefore,
            userDataBefore,
            await getTimestamp(tx),
            duration,
            newRewardPersecond
          );

          const stakeTx = await testEnv.stakingPool.connect(alice).withdraw(amount);
          const [expectedPoolData_2, expectedUserData_2] = expectDataAfterWithdraw(
            expectedPoolData_1,
            expectedUserData_1,
            await getTimestamp(stakeTx),
            amount
          );

          const poolDataAfter = await getPoolData(testEnv);
          const userDataAfter = await getUserData(testEnv, alice);

          expect(poolDataAfter).eql(expectedPoolData_2);
          expect(userDataAfter).eql(expectedUserData_2);
        });
      });
    });

    context('in case of emergency', async () => {
      beforeEach('init the pool and alice stakes', async () => {
        await actions.faucetAndApproveReward(deployer, RAY);
        await actions.faucetAndApproveTarget(alice, RAY);
        await actions.initNewPoolAndTransfer(
          deployer,
          rewardPersecond,
          firstTimestamp,
          duration
        );

        await advanceTimeTo(firstTimestamp);
        await testEnv.stakingPool.connect(alice).stake(amount);
      });

      it('succeeds if alice withdraws', async () => {
        await testEnv.stakingPool.connect(deployer).setEmergency(true);

        const poolDataBefore = await getPoolData(testEnv);
        const userDataBefore = await getUserData(testEnv, alice);

        const withdrawTx = await testEnv.stakingPool
          .connect(alice)
          .withdraw(amount);

        const [expectedPoolData, expectedUserData] = expectDataAfterWithdraw(
          poolDataBefore,
          userDataBefore,
          await getTimestamp(withdrawTx),
          amount
        );
        const poolDataAfter = await getPoolData(testEnv);
        const userDataAfter = await getUserData(testEnv, alice);

        expect(poolDataAfter).to.eql(expectedPoolData);
        expect(userDataAfter).to.eql(expectedUserData);
      });
    });
  });
});
