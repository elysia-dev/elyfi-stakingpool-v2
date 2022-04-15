import { BigNumber, utils, ethers } from 'ethers';
import { waffle } from 'hardhat';
import { expect } from 'chai';
import TestEnv from './types/TestEnv';
import { RAY, SECONDSPERDAY } from './utils/constants';
import { setTestEnv } from './utils/testEnv';
import { advanceTimeTo, getTimestamp, toTimestamp } from './utils/time';
import { expectDataAfterStake, updatePoolData } from './utils/expect';
import { createTestActions, getPoolData, getUserData, TestHelperActions } from './utils/helpers';

const { loadFixture } = waffle;

require('./utils/matchers.ts');

describe('StakingPool.stake', () => {
  let testEnv: TestEnv;
  let actions: TestHelperActions;

  const provider = waffle.provider;
  const [deployer, alice, bob, carol] = provider.getWallets();

  const rewardPersecond = BigNumber.from(utils.parseEther('1'));
  const year = BigNumber.from(2022);
  const month = BigNumber.from(7);
  const day = BigNumber.from(7);
  const duration = BigNumber.from(30).mul(SECONDSPERDAY);

  const month_end = BigNumber.from(8);
  const day_end = BigNumber.from(20);

  const startTimestamp = toTimestamp(year, month, day, BigNumber.from(10));
  const endTimestamp = toTimestamp(year, month_end, day_end, BigNumber.from(10));

  const stakeAmount = utils.parseEther('10');
  const newRewardPersecond = BigNumber.from(utils.parseEther('2'));

  async function fixture() {
    return await setTestEnv();
  }

  beforeEach('deploy staking pool', async () => {
    testEnv = await loadFixture(fixture);
    actions = createTestActions(testEnv);
    await actions.faucetAndApproveReward(deployer, RAY);
    await actions.faucetAndApproveTarget(alice, RAY);
  });

  it('reverts if the pool has not initiated', async () => {
    await expect(actions.stake(alice, utils.parseEther('100')))
      .to.be.revertedWith('StakingNotInitiated');
  });

  context('when the pool initiated', async () => {
    context('when the pool has started', async () => {
      beforeEach(async () => {
        const tx = await testEnv.stakingPool
          .connect(deployer)
          .initNewPool(rewardPersecond, startTimestamp, duration);
        await advanceTimeTo(await getTimestamp(tx), startTimestamp);
      });

      it('reverts if user staking amount is 0', async () => {
        await expect(actions.stake(alice, BigNumber.from('0')))
          .to.be.revertedWith('InvalidAmount');
      });

      it('success', async () => {
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

        expect(poolDataAfter).to.eql(expectedPoolData);
        expect(userDataAfter).to.eql(expectedUserData);
      });

      context('pool is closed', async () => {
        beforeEach('time passes and pool is closed', async () => {
          const tx = await actions.stake(alice, stakeAmount);
          await advanceTimeTo(await getTimestamp(tx), endTimestamp);
        });

        it('revert if general account close the pool', async () => {
          await expect(testEnv.stakingPool.connect(alice).closePool()
          ).to.be.revertedWith('OnlyAdmin');
        });

        it('revert if open the pool already finished', async () => {
          await actions.closePool(deployer);
          await expect(
            actions.initNewPool(deployer, rewardPersecond, startTimestamp, duration)
          ).to.be.revertedWith('Finished');
        });

        it('revert if staking in the pool finished', async () => {
          await actions.closePool(deployer);
          await expect(actions.stake(alice, stakeAmount)).to.be.revertedWith('Closed');
        });
      });
    });
  });

  context('staking scenario', async () => {
    beforeEach('init the pool and time passes', async () => {
      await actions.initNewPool(deployer, rewardPersecond, startTimestamp, duration);
      const tx = actions.faucetAndApproveTarget(bob, RAY);
      await advanceTimeTo(await getTimestamp(tx), startTimestamp);
    });

    it('first stake and second stake from alice', async () => {
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);

      const poolDataBefore = await getPoolData(testEnv);
      const userDataBefore = await getUserData(testEnv, alice);
      const stakeTx = await testEnv.stakingPool.connect(alice).stake(stakeAmount);

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

    it('first stake, second stake and third stake from alice', async () => {
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);

      const poolDataBefore = await getPoolData(testEnv);
      const userDataBefore = await getUserData(testEnv, alice);
      const stakeTx = await testEnv.stakingPool.connect(alice).stake(stakeAmount);

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

    it('first stake, second stake from alice, third stake from bob', async () => {
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);

      const poolDataBefore = await getPoolData(testEnv);
      const userDataBefore = await getUserData(testEnv, bob);
      const stakeTx = await testEnv.stakingPool.connect(bob).stake(stakeAmount);

      const [expectedPoolData, expectedUserData] = expectDataAfterStake(
        poolDataBefore,
        userDataBefore,
        await getTimestamp(stakeTx),
        stakeAmount
      );

      const poolDataAfter = await getPoolData(testEnv);
      const userDataAfter = await getUserData(testEnv, bob);

      expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
      expect(userDataAfter).to.be.equalUserData(expectedUserData);
    });

    it('first stake, second stake from alice, third stake and fourth stake from bob', async () => {
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      await testEnv.stakingPool.connect(bob).stake(stakeAmount);

      const poolDataBefore = await getPoolData(testEnv);
      const userDataBefore = await getUserData(testEnv, bob);
      const stakeTx = await testEnv.stakingPool.connect(bob).stake(stakeAmount);

      const [expectedPoolData, expectedUserData] = expectDataAfterStake(
        poolDataBefore,
        userDataBefore,
        await getTimestamp(stakeTx),
        stakeAmount
      );

      const poolDataAfter = await getPoolData(testEnv);
      const userDataAfter = await getUserData(testEnv, bob);

      expect(poolDataAfter).to.be.equalPoolData(expectedPoolData);
      expect(userDataAfter).to.be.equalUserData(expectedUserData);
    });
  });

  context('rewardPerSecond is changed', async () => {
    beforeEach('init the pool and stake in pool', async () => {
      await testEnv.stakingPool
        .connect(deployer)
        .initNewPool(rewardPersecond, startTimestamp, duration);
      const tx = await testEnv.stakingAsset.connect(alice).approve(testEnv.stakingPool.address, RAY);
      await advanceTimeTo(await getTimestamp(tx), startTimestamp);
      await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      await testEnv.rewardAsset.connect(deployer).transfer(testEnv.stakingPool.address, ethers.utils.parseEther('100'));
    });

    it('rewardPerSecond is changed and stake in pool', async () => {
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

      const stakeTx = await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      const [expectedPoolData_2, expectedUserData_2] = expectDataAfterStake(
        expectedPoolData_1,
        expectedUserData_1,
        await getTimestamp(stakeTx),
        stakeAmount
      );

      const poolDataAfter = await getPoolData(testEnv);
      const userDataAfter = await getUserData(testEnv, alice);

      expect(poolDataAfter).to.be.equalPoolData(expectedPoolData_2);
      expect(userDataAfter).to.be.equalUserData(expectedUserData_2);
    });

    it('rewardPerSecond is changed and stake in pool twice', async () => {
      const poolDataBefore_1 = await getPoolData(testEnv);
      const userDataBefore_1 = await getUserData(testEnv, alice);
      const tx = await testEnv.stakingPool.connect(deployer).extendPool(newRewardPersecond, duration);
      // check stake 1
      const [expectedPoolData_1, expectedUserData_1] = updatePoolData(
        poolDataBefore_1,
        userDataBefore_1,
        await getTimestamp(tx),
        duration,
        newRewardPersecond
      );

      const stakeTx_1 = await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      const [expectedPoolData_2, expectedUserData_2] = expectDataAfterStake(
        expectedPoolData_1,
        expectedUserData_1,
        await getTimestamp(stakeTx_1),
        stakeAmount
      );

      const poolDataAfter_1 = await getPoolData(testEnv);
      const userDataAfter_1 = await getUserData(testEnv, alice);

      expect(poolDataAfter_1).to.be.equalPoolData(expectedPoolData_2);
      expect(userDataAfter_1).to.be.equalUserData(expectedUserData_2);


      // check stake 2
      const poolDataBefore_2 = await getPoolData(testEnv);
      const userDataBefore_2 = await getUserData(testEnv, alice);
      const stakeTx_2 = await testEnv.stakingPool.connect(alice).stake(stakeAmount);
      const [expectedPoolData_3, expectedUserData_3] = expectDataAfterStake(
        poolDataBefore_2,
        userDataBefore_2,
        await getTimestamp(stakeTx_2),
        stakeAmount
      );

      const poolDataAfter_2 = await getPoolData(testEnv);
      const userDataAfter_2 = await getUserData(testEnv, alice);

      expect(poolDataAfter_2).to.be.equalPoolData(expectedPoolData_3);
      expect(userDataAfter_2).to.be.equalUserData(expectedUserData_3);
    });
  })
});
