let EVMRevert = require('openzeppelin-solidity/test/helpers/assertRevert')

let timeTravel = require('./helper/timeTravel.js')
const time = require('openzeppelin-solidity/test/helpers/increaseTime')
import { latestTime } from 'openzeppelin-solidity/test/helpers/latestTime'

const DividendAssetToken = artifacts.require('DividendAssetToken.sol')
const MOCKCRWDClearing = artifacts.require('MOCKCRWDClearing.sol')
const ERC20 = artifacts.require('ERC20.sol')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

require('chai')
  .use(require('chai-as-promised'))
  .should()

contract('DividendAssetToken', (accounts) => {
    let token = null
    let owner = null

    let clearing = null
    
    const ONEETHER  = 1000000000000000000
    const HALFETHER = ONEETHER / 2
    const QUARTERETHER = HALFETHER / 2
    const SECONDS_IN_A_YEAR = 86400 * 366
    const SECONDS_IN_A_MONTH = 86400 * 30

    let buyerA = accounts[1]
    let buyerB = accounts[2]
    let buyerC = accounts[3]
    let buyerD = accounts[4]
    let buyerE = accounts[5]

    let condaAccount = accounts[6]
    let companyAccount = accounts[7]
    
    let capitalControl = accounts[8]

    let nowTime = null
    let startTime = null
    let endTime = null
    let afterEndTime = null

    beforeEach(async () => {
        nowTime = await latestTime()
        startTime = nowTime
        endTime = startTime + time.duration.weeks(2)
        afterEndTime = endTime + time.duration.seconds(1)

        token = await DividendAssetToken.new()
        await token.setMintControl(capitalControl)
        await token.setMetaData("", "", ZERO_ADDRESS, (1000 * 1e18), (100 * 1e18), startTime, endTime)
        await token.setTokenAlive()
        await token.enableTransfers(true)
        owner = await token.owner()
        
        //mock clearing so it doesn't cost money
        clearing = await MOCKCRWDClearing.new()
        await clearing.setFee((await ERC20.new()).address, 0, 0, condaAccount, companyAccount)
        await token.setClearingAddress(clearing.address)
        
        //split
        await token.mint(buyerA, 100, {from: capitalControl}) //10%
        await token.mint(buyerB, 250, {from: capitalControl}) //25%
        await token.mint(buyerD, 500, {from: capitalControl}) //50%
        await token.mint(buyerE, 150, {from: capitalControl}) //15%

        //Make a deposit
        await token.depositDividend({from: owner, value: ONEETHER, gasPrice: 0})
        let balance = await web3.eth.getBalance(token.address)
        assert.equal(balance, ONEETHER)
    })

    let claimDividendAAll = async () => {
        return await token.claimDividendAll({from: buyerA, gasPrice: 0})
    }

    let claimDividendA = async () => {
        return await token.claimDividend(0, {from: buyerA, gasPrice: 0})
    }

    let claimDividendB = async () => {
        return await token.claimDividend(0, {from: buyerB, gasPrice: 0})
    }

    let claimAll = async () => {
        await claimDividendA()
        await claimDividendB()
        await token.claimDividendAll({from: buyerC, gasPrice: 0})
        await token.claimDividendAll({from: buyerD, gasPrice: 0})
        await token.claimDividendAll({from: buyerE, gasPrice: 0})
    }

    let claimInBatch = async (years) => {
        for(let yearCount = 0; yearCount < years; yearCount++) {
            const fromIdx = 1 + yearCount*12
            const tillIdx = 12 + yearCount*12

            await token.claimInBatches(fromIdx, tillIdx, {from: buyerA, gasPrice: 0})
        }
    }

    let claimAllButD = async () => {
        await claimDividendA()
        await claimDividendB()
        await token.claimDividendAll({from: buyerC, gasPrice: 0})
        //await token.claimDividendAll({from: buyerD, gasPrice: 0})
        await token.claimDividendAll({from: buyerE, gasPrice: 0})
    }

    contract('validating claim', () => {
        it('buyer A should claim 0.1 of dividend', async () => {
            let beforeBalanceOne = await web3.eth.getBalance(buyerA)
            await claimDividendA()
            let afterBalanceOne = await web3.eth.getBalance(buyerA)
            assert.equal(beforeBalanceOne.add(0.1 * ONEETHER).toNumber(), afterBalanceOne.toNumber(), "buyer A should claim 0.1 of dividend")
        })

        it('buyer B should claim 0.25 of dividend', async () => {
            let beforeBalanceTwo = await web3.eth.getBalance(buyerB)
            await claimDividendB()
            let afterBalanceTwo = await web3.eth.getBalance(buyerB)
            assert.equal(beforeBalanceTwo.add(0.25 * ONEETHER).toNumber(), afterBalanceTwo.toNumber(), "buyer B should claim 0.25 of dividend")
        })

        it('Make sure further claims on this dividend fail for buyer A', async () => {
            await claimDividendA()
            await token.claimDividend(0, {from: buyerA, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
        })

        it('Make sure further claims on this dividend fail for buyer B', async () => {
            await claimDividendB()
            await token.claimDividend(0, {from: buyerB, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
        })

        it('Make sure zero balances give no value', async () => {
            let beforeBalanceThree = await web3.eth.getBalance(buyerC)
            await token.claimDividend(0, {from: buyerC, gasPrice: 0})
            let afterBalanceThree = await web3.eth.getBalance(buyerC)
            assert.equal(beforeBalanceThree.toNumber(), afterBalanceThree.toNumber(), "buyer C should have no claim")
        })
    })

    contract('validating claim when transfered', () => {
        it('buyer A claimed, then transfered to buyer B -> buyer B should claim original 0.25 of dividend', async () => {
            //buyer A claims
            let beforeBalanceOne = await web3.eth.getBalance(buyerA)
            await claimDividendA()
            let afterBalanceOne = await web3.eth.getBalance(buyerA)
            assert.equal(beforeBalanceOne.add(0.1 * ONEETHER).toNumber(), afterBalanceOne.toNumber(), "buyer A should claim 0.1 of dividend")

            //buyer A transfers all his share to buyer B (after claiming)
            await token.transfer(buyerB, 100, {from: buyerA, gasPrice: 0})

            //buyer B claims
            let beforeBalanceTwo = await web3.eth.getBalance(buyerB)
            await claimDividendB()
            let afterBalanceTwo = await web3.eth.getBalance(buyerB)
            assert.equal(beforeBalanceTwo.add(0.25 * ONEETHER).toNumber(), afterBalanceTwo.toNumber(), "buyer B should claim 0.25 of dividend")
        })

        it('buyer A unclaimed, then transfered to buyer B. buyer A claims, buyer B claims -> unchainged: buyer A gets 0.1 buyer B gets 0.25', async () => {
            let beforeBalanceOne = await web3.eth.getBalance(buyerA)

            //buyer A transfers all his share to buyer B (before claiming)
            await token.transfer(buyerB, 100, {from: buyerA, gasPrice: 0})

            //buyer A can still claim first deposit
            await claimDividendA()
            let afterBalanceOne = await web3.eth.getBalance(buyerA)
            assert.equal(beforeBalanceOne.add(0.1 * ONEETHER).toNumber(), afterBalanceOne.toNumber(), "buyer A should claim 0.1 of dividend")

            //buyer B claims (gets original share of first deposit)
            let beforeBalanceTwo = await web3.eth.getBalance(buyerB)
            await claimDividendB()
            let afterBalanceTwo = await web3.eth.getBalance(buyerB)
            assert.equal(beforeBalanceTwo.add(0.25 * ONEETHER).toNumber(), afterBalanceTwo.toNumber(), "buyer B should claim 0.25 of dividend")
        })

        it('buyer A claimed, then transfered to buyer B. then new deposit -> buyer B should claim 0.25 then 0.25+0.1', async () => {
            //buyer A claims
            let beforeBalanceOne = await web3.eth.getBalance(buyerA)
            await claimDividendA()
            let afterBalanceOne = await web3.eth.getBalance(buyerA)
            assert.equal(beforeBalanceOne.add(0.1 * ONEETHER).toNumber(), afterBalanceOne.toNumber(), "buyer A should claim 0.1 of dividend")

            //buyer A transfers
            await token.transfer(buyerB, 100, {from: buyerA, gasPrice: 0})

            let beforeBalanceTwo = await web3.eth.getBalance(buyerB)
            await token.claimDividend(0, {from: buyerB, gasPrice: 0})
            let afterBalanceTwo = await web3.eth.getBalance(buyerB)
            assert.equal(beforeBalanceTwo.add(0.25 * ONEETHER).toNumber(), afterBalanceTwo.toNumber(), "buyer B should claim 0.25 of first dividend")

            //second deposit after token transfer
            await token.depositDividend({from: owner, value: ONEETHER})

            //byuer B claims second deposit
            let beforeBalanceThree = await web3.eth.getBalance(buyerB)
            await token.claimDividend(1, {from: buyerB, gasPrice: 0})
            let afterBalanceThree = await web3.eth.getBalance(buyerB)
            assert.equal(beforeBalanceThree.add((0.25+0.1) * ONEETHER).toNumber(), afterBalanceThree.toNumber(), "buyer B should claim 0.25+0.1 of second dividend")

            //byuer A claims second deposit (without luck)
            let beforeBalanceFour = await web3.eth.getBalance(buyerA)
            await token.claimDividend(1, {from: buyerA, gasPrice: 0})
            let afterBalanceFour = await web3.eth.getBalance(buyerA)
            assert.equal(beforeBalanceFour.toNumber(), afterBalanceFour.toNumber(), "buyer A has nothing to claim")
        })
    })

    contract('validating claimAll (can take a bit longer)', () => {
        it('claimAll does not run out of gas: 5 years, monthly dividends', async () => {
            let beforeBalanceA = await web3.eth.getBalance(buyerA)

            const dividendPaymentCount = 5*12
            for(let i=0; i<dividendPaymentCount; i++) {
                await token.depositDividend({from: owner, value: QUARTERETHER})
            }
            
            await claimDividendAAll()

            let afterBalanceA = await web3.eth.getBalance(buyerA)

            const expectedTotalEther = ONEETHER + (QUARTERETHER*dividendPaymentCount)
            assert.equal(beforeBalanceA.add(0.1 * expectedTotalEther).toNumber(), afterBalanceA.toNumber(), "buyer A should claim 0.1 of dividend")
        })
    })

    contract('validating claimInBatches (can take a bit longer)', () => {
        it('claimInBatches does not run out of gas: 11 years, monthly dividends, yearly batches', async () => {
            let beforeBalanceA = await web3.eth.getBalance(buyerA)

            const years = 11

            const dividendPaymentCount = years*12
            for(let i=0; i<dividendPaymentCount; i++) {
                await token.depositDividend({from: owner, value: QUARTERETHER})
            }

            await claimInBatch(years)

            //trying to claim again before claimed all shouldn't affect the expected result
            await claimInBatch(years)

            await token.claimDividend(0, {from: buyerA, gasPrice: 0}) //from beforeEach

            let afterBalanceA = await web3.eth.getBalance(buyerA)

            const expectedTotalEther = ONEETHER + (QUARTERETHER*dividendPaymentCount)
            assert.equal(beforeBalanceA.add(0.1 * expectedTotalEther).toNumber(), afterBalanceA.toNumber(), "buyer A should claim 0.1 of dividend")
        })
    })

    contract('validating recycle', () => {
        it('Add a new token balance for account C', async () => {
            await token.mint(buyerC, 800, {from: capitalControl})
            const balance = await token.balanceOf(buyerC)
            assert.equal(balance, 800)
        })

        it('Recycle remainder of dividend distribution 0 should fail within one year ', async () => {
            await token.recycleDividend(0, {from: owner}).should.be.rejectedWith(EVMRevert)
        })

        it('Recycle remainder of dividend distribution 0', async () => {
            await timeTravel(SECONDS_IN_A_YEAR) //1 year time lock passes

            await token.recycleDividend(0, {from: owner})
        })

        it('Check noone can claim recycled dividend', async () => {
            //claim all but buyerD
            await claimDividendA()
            await claimDividendB()
            await token.claimDividendAll({from: buyerC, gasPrice: 0})
            //await token.claimDividendAll({from: buyerD, gasPrice: 0})
            await token.claimDividendAll({from: buyerE, gasPrice: 0})

            const beforeBalanceA = await web3.eth.getBalance(buyerA)
            const beforeBalanceB = await web3.eth.getBalance(buyerB)
            const beforeBalanceC = await web3.eth.getBalance(buyerC)
            const beforeBalanceD = await web3.eth.getBalance(buyerD)
            const beforeBalanceE = await web3.eth.getBalance(buyerE)
        
            await timeTravel(SECONDS_IN_A_YEAR) //1 year time lock passes

            await token.recycleDividend(0, {from: owner}) //act
            
            await token.claimDividend(0, {from: buyerA, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(0, {from: buyerB, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(0, {from: buyerC, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(0, {from: buyerD, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(0, {from: buyerE, gasPrice: 0}).should.be.rejectedWith(EVMRevert)

            const newDividendIndexAfterRecycle = 1

            await token.claimDividend(newDividendIndexAfterRecycle, {from: buyerA, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(newDividendIndexAfterRecycle, {from: buyerB, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(newDividendIndexAfterRecycle, {from: buyerC, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(newDividendIndexAfterRecycle, {from: buyerD, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            await token.claimDividend(newDividendIndexAfterRecycle, {from: buyerE, gasPrice: 0}).should.be.rejectedWith(EVMRevert)

            const afterBalanceA = await web3.eth.getBalance(buyerA)
            const afterBalanceB = await web3.eth.getBalance(buyerB)
            const afterBalanceC = await web3.eth.getBalance(buyerC)
            const afterBalanceD = await web3.eth.getBalance(buyerD)
            const afterBalanceE = await web3.eth.getBalance(buyerE)

            //Balances for recycled dividend 1 are 100, 250, 500, 150, total = 1000, recycled dividend is 50% of total
            assert.equal(afterBalanceA.toNumber(), beforeBalanceA.toNumber(), "buyer A should claim dividend")
            assert.equal(afterBalanceB.toNumber(), beforeBalanceB.toNumber(), "buyer B should claim dividend")
            assert.equal(afterBalanceC.toNumber(), beforeBalanceC.toNumber(), "buyer C should claim dividend")
            assert.equal(afterBalanceD.toNumber(), beforeBalanceD.toNumber(), "buyer D recycled his dividend")
            assert.equal(afterBalanceE.toNumber(), beforeBalanceE.toNumber(), "buyer E should claim dividend")
        })

        it('Check owner can claim recycled dividend', async () => {
            //claim all but buyerD
            await token.claimDividendAll({from: buyerD, gasPrice: 0}) //claims his 50%

            const beforeBalanceA = await web3.eth.getBalance(buyerA)
            const beforeBalanceOwner = await web3.eth.getBalance(owner)
        
            await timeTravel(SECONDS_IN_A_YEAR) //1 year time lock passes

            await token.recycleDividend(0, {from: owner, gasPrice: 0}) //act
            
            await token.claimDividend(0, {from: buyerA, gasPrice: 0}).should.be.rejectedWith(EVMRevert)

            const newDividendIndexAfterRecycle = 1

            await token.claimDividend(newDividendIndexAfterRecycle, {from: buyerA, gasPrice: 0}).should.be.rejectedWith(EVMRevert)
            
            const afterBalanceA = await web3.eth.getBalance(buyerA)
            const afterBalanceOwner = await web3.eth.getBalance(owner)
            
            //Balances for recycled dividend 1 are 100, 250, 500, 150, total = 1000, recycled dividend is 50% of total
            assert.equal(afterBalanceA.toNumber(), beforeBalanceA.toNumber(), "buyer A should claim dividend")
            assert.notEqual(afterBalanceOwner, beforeBalanceOwner, "owner balance didn't change")
            assert.equal(afterBalanceOwner.toNumber(), beforeBalanceOwner.add(ONEETHER/2).toNumber(), "owner should claim dividend")
        })
    })
})
