import { BigNumber, utils } from 'ethers';
import { waffle } from 'hardhat';
import TestEnv from './interfaces/TestEnv';
import { MAX_UINT_AMOUNT, RAY, ZERO_ADDRESS } from './utils/constants';
import { setTestEnv } from './utils/testEnv';
import { advanceTimeTo, getTimestamp, toTimestamp } from './utils/time';
import { expectDataAfterStake } from './utils/expect';
import { getPoolData, getUserData } from './utils/helpers';

const { loadFixture } = waffle;

require('./utils/matchers.ts');

import { expect } from 'chai';
import { buildDelegationData, getSignatureFromTypedData } from './utils/signature';

describe('StakingPool.token', () => {
  let testEnv: TestEnv;
  let chainId: number;

  const provider = waffle.provider;
  const [deployer, alice, bob, carol] = provider.getWallets();

  const rewardPersecond = BigNumber.from(utils.parseEther('1'));
  const year = BigNumber.from(2022);
  const month = BigNumber.from(7);
  const day = BigNumber.from(7);
  const duration = BigNumber.from(30);

  const startTimestamp = toTimestamp(year, month, day, BigNumber.from(10));

  async function fixture() {
    const testEnv = await setTestEnv();
    await testEnv.stakingPool
      .connect(deployer)
      .initNewRound(rewardPersecond, year, month, day, duration);
    return testEnv;
  }

  before(async () => {
    chainId = (await waffle.provider.getNetwork()).chainId;
  });

  after(async () => {
    await loadFixture(fixture);
  });

  beforeEach('deploy and init staking pool', async () => {
    testEnv = await loadFixture(fixture);
  });

  context('ERC20Wrapper', async () => {
    beforeEach('deploy staking pool', async () => {
      await testEnv.stakingAsset.connect(alice).faucet();
      const tx = await testEnv.stakingAsset
        .connect(alice)
        .approve(testEnv.stakingPool.address, RAY);
      await advanceTimeTo(await getTimestamp(tx), startTimestamp);
    });

    it('wrapper tokens are minted in staking', async () => {
      const tx = await testEnv.stakingPool.connect(alice).stake(utils.parseEther('100'));
      expect(tx)
        .to.emit(testEnv.stakingPool, 'Transfer')
        .withArgs(ZERO_ADDRESS, alice.address, utils.parseEther('100'));
      expect(await testEnv.stakingPool.balanceOf(alice.address)).to.be.equal(
        utils.parseEther('100')
      );
    });

    it('wrapper tokens are burned in unstaking', async () => {
      const currentRound = await testEnv.stakingPool.currentRound();
      await testEnv.stakingPool.connect(alice).stake(utils.parseEther('100'));
      const tx = await testEnv.stakingPool
        .connect(alice)
        .withdraw(utils.parseEther('100'), currentRound);
      expect(tx)
        .to.emit(testEnv.stakingPool, 'Transfer')
        .withArgs(alice.address, ZERO_ADDRESS, utils.parseEther('100'));
    });
  });

  context('ERC20Votes', async () => {
    beforeEach('time passes', async () => {
      await testEnv.stakingAsset.connect(alice).faucet();
      const tx = await testEnv.stakingAsset
        .connect(alice)
        .approve(testEnv.stakingPool.address, RAY);
      await advanceTimeTo(await getTimestamp(tx), startTimestamp);
      await testEnv.stakingPool.connect(alice).stake(utils.parseEther('100'));
    });
    it('voting power should be 0 before self delegation', async () => {
      expect(await testEnv.stakingPool.balanceOf(alice.address)).to.be.equal(
        utils.parseEther('100')
      );
      expect(await testEnv.stakingPool.getVotes(alice.address)).to.be.equal(0);
    });

    it('self delegation', async () => {
      await testEnv.stakingPool.connect(alice).delegate(alice.address);
      expect(await testEnv.stakingPool.getVotes(alice.address)).to.be.equal(
        utils.parseEther('100')
      );
    });

    it('delegates by sig', async () => {
      const nonce = '0';
      const data = buildDelegationData(
        chainId,
        testEnv.stakingPool.address,
        alice.address,
        nonce,
        MAX_UINT_AMOUNT
      );
      const signature = getSignatureFromTypedData(alice.privateKey, data);

      await testEnv.stakingPool.delegateBySig(
        alice.address,
        nonce,
        MAX_UINT_AMOUNT,
        signature.v,
        signature.r,
        signature.s
      );
      expect(await testEnv.stakingPool.getVotes(alice.address)).to.be.equal(
        utils.parseEther('100')
      );
    });
  });

  context('ERC20 permit', async () => {
    beforeEach('init the first round and time passes', async () => {
      await testEnv.stakingPool
        .connect(deployer)
        .initNewRound(rewardPersecond, year, month, day, duration);

      await testEnv.stakingAsset.connect(alice).faucet();
      await testEnv.stakingAsset.connect(alice).approve(testEnv.stakingPool.address, RAY);
      await testEnv.stakingAsset.connect(bob).faucet();
      const tx = await testEnv.stakingAsset.connect(bob).approve(testEnv.stakingPool.address, RAY);
      await advanceTimeTo(await getTimestamp(tx), startTimestamp);
    });
  });
});
