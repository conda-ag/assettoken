pragma solidity ^0.4.24;

/*
    Copyright 2018, CONDA

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import "../abstract/ICRWDAssetToken.sol";

/** @title FeatureCapitalControl. */
contract FeatureCapitalControl is ICRWDAssetToken {
    
    //if set can mint after finished. E.g. a notary.
    address public capitalControl;

    //override: skip certain modifier checks as capitalControl
    function _canDoAnytime() internal view returns (bool) {
        return msg.sender == capitalControl;
    }

    modifier onlyCapitalControl() {
        require(msg.sender == capitalControl);
        _;
    }

    function setCapitalControl(address _capitalControl) public {
        require(checkCanSetMetadata());

        capitalControl = _capitalControl;
    }

    function updateCapitalControl(address _capitalControl) public onlyCapitalControl {
        capitalControl = _capitalControl;
    }

    constructor(address _capitalControl) public {
        capitalControl = _capitalControl;
        enableTransferInternal(false); //disable transfer as default
    }

////////////////
// Reopen crowdsale (by capitalControl e.g. notary)
////////////////

    /** 
      * @dev capitalControl can reopen the crowdsale.
      */
    function reopenCrowdsale() public onlyCapitalControl returns (bool) {        
        return reopenCrowdsaleInternal();
    }
}