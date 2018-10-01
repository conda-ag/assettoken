var Migrations = artifacts.require("./Migrations.sol");

module.exports = (deployer) => {
  deployer.then(async () => { //fake async await support: https://github.com/trufflesuite/truffle/issues/501
    await deployer.deploy(Migrations)
  })
}
