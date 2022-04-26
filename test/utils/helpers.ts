import { MAX_UINT_AMOUNT } from './constants';
import { BigNumber, Wallet, ethers } from 'ethers';
import { expect } from 'chai';
import PoolData from '../types/PoolData';
import TestEnv from '../types/TestEnv';
import UserData from '../types/UserData';
import { expectDataAfterStake } from '../utils/expect';
import { getTimestamp } from '../utils/time';

export type TestHelperActions = {
  faucetAndApproveTarget: (wallet: Wallet, amount?: string) => Promise<void>
  faucetAndApproveReward: (wallet: Wallet, amount?: string) => Promise<void>
  stake: (wallet: Wallet, amount: BigNumber) => Promise<ethers.ContractTransaction>
  withdraw: (wallet: Wallet, amount: BigNumber) => Promise<ethers.ContractTransaction>
  claim: (wallet: Wallet) => Promise<ethers.ContractTransaction>
  initNewPoolAndTransfer: (
    wallet: Wallet,
    rewardPerSecond: BigNumber,
    startTimestamp: BigNumber,
    duration: BigNumber,
  ) => Promise<void>
  closePool: (wallet: Wallet) => Promise<ethers.ContractTransaction>
  setEmergency: (wallet: Wallet, stop: boolean) => Promise<ethers.ContractTransaction>

  // Queries
  getUserData: (wallet: Wallet) => Promise<UserData>
  getPoolData: () => Promise<PoolData>

  // Assertions
  checkAfterStake: (wallet: Wallet, amount: BigNumber) => Promise<void>
}

export const createTestActions = (testEnv: TestEnv): TestHelperActions => {
  const { stakingAsset, stakingPool, rewardAsset } = testEnv;

  // A target is the token staked.
  const faucetAndApproveTarget = async (
    wallet: Wallet,
    amount?: string,
  ) => {
    if (amount === undefined) {
      amount = MAX_UINT_AMOUNT;
    }
    await stakingAsset.connect(wallet).faucet();
    await stakingAsset.connect(wallet).approve(stakingPool.address, amount);
  }

  const faucetAndApproveReward = async (
    wallet: Wallet,
    amount?: string,
  ) => {
    if (amount === undefined) {
      amount = MAX_UINT_AMOUNT;
    }
    await rewardAsset.connect(wallet).faucet();
    await rewardAsset.connect(wallet).approve(stakingPool.address, amount);
  }

  const stake = (
    wallet: Wallet,
    amount: BigNumber,
  ) => {
    return stakingPool.connect(wallet).stake(amount);
  }

  const initNewPoolAndTransfer = async (
    wallet: Wallet,
    rewardPerSecond: BigNumber,
    startTimestamp: BigNumber,
    duration: BigNumber,
  ) => {
    const totalRewardAmount = rewardPerSecond.mul(duration)

    await stakingPool
      .connect(wallet)
      .initNewPool(rewardPerSecond, startTimestamp, duration)

    await rewardAsset
      .connect(wallet)
      .transfer(stakingPool.address, totalRewardAmount)
  }

  const closePool = (
    wallet: Wallet,
  ) => stakingPool.connect(wallet).closePool();

  const setEmergency = (
    wallet: Wallet,
    stop: boolean,
  ) => stakingPool.connect(wallet).setEmergency(stop);

  const claim = (
    wallet: Wallet
  ) => stakingPool.connect(wallet).claim();

  const withdraw = (
    wallet: Wallet,
    amount: BigNumber,
  ) => stakingPool.connect(wallet).withdraw(amount);

  const getUserData = (wallet: Wallet) => _getUserData(testEnv, wallet);

  const getPoolData = () => _getPoolData(testEnv);

  // assertions
  const checkAfterStake = async (
    wallet: Wallet,
    amount: BigNumber,
  ) => {
    const poolDataBefore = await getPoolData();
    const userDataBefore = await getUserData(wallet);
    const stakeTx = await stake(wallet, amount);

    const [expectedPoolData, expectedUserData] = expectDataAfterStake(
      poolDataBefore,
      userDataBefore,
      await getTimestamp(stakeTx),
      amount
    );

    const poolDataAfter = await getPoolData();
    const userDataAfter = await getUserData(wallet);

    expect(poolDataAfter).to.eql(expectedPoolData);
    expect(userDataAfter).to.eql(expectedUserData);
  }

  return {
    faucetAndApproveReward,
    faucetAndApproveTarget,
    stake,
    withdraw,
    claim,
    initNewPoolAndTransfer,
    closePool,
    setEmergency,
    getUserData,
    getPoolData,
    checkAfterStake,
  }
}

const _getUserData = async (
  testEnv: TestEnv,
  user: Wallet | string,
): Promise<UserData> => {
  const userData = <UserData>{};
  const address = typeof user === 'string' ? user : user.address;

  const contractUserData = await testEnv.stakingPool.getUserData(address);

  userData.rewardAssetBalance = await testEnv.rewardAsset.balanceOf(address);
  userData.stakingAssetBalance = await testEnv.stakingAsset.balanceOf(address);
  userData.userPrincipal = contractUserData.userPrincipal;
  userData.userIndex = contractUserData.userIndex;
  userData.userPreviousReward = contractUserData.userReward;
  userData.userReward = await testEnv.stakingPool.getUserReward(address);

  return userData;
};

const _getPoolData = async (testEnv: TestEnv) => {
  const poolData = <PoolData>{};
  const contractPoolData = await testEnv.stakingPool.getPoolData();

  poolData.rewardPerSecond = contractPoolData.rewardPerSecond;
  poolData.rewardIndex = contractPoolData.rewardIndex;
  poolData.startTimestamp = contractPoolData.startTimestamp;
  poolData.endTimestamp = contractPoolData.endTimestamp;
  poolData.totalPrincipal = contractPoolData.totalPrincipal;
  poolData.lastUpdateTimestamp = contractPoolData.lastUpdateTimestamp;
  poolData.stakingAssetBalance = await testEnv.stakingAsset.balanceOf(testEnv.stakingPool.address);
  poolData.rewardAssetBalance = await testEnv.rewardAsset.balanceOf(testEnv.stakingPool.address);

  return poolData;
};

export const getUserData = _getUserData;
export const getPoolData = _getPoolData;
