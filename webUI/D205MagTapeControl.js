/***********************************************************************
* retro-205/webUI D205MagTapeControl.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 MagTape Control unit module.
************************************************************************
* 2015-06-13  P.Kimpel
*   Original version, from D205ConsoleConsole.js.
***********************************************************************/
"use strict";

/**************************************/
function D205MagTapeControl(p) {
    /* Constructor for the MagTapeControl object */
    var left = 600;                     // control window left position
    var u;                              // unit configuration object
    var x;                              // unit index

    this.config = p.config;             // System configuration object
    this.mnemonic = "MCU";
    this.p = p;                         // D205Processor object

    // Do not call this.clear() here -- call this.clearUnit() from onLoad instead

    this.doc = null;
    this.window = window.open("../webUI/D205MagTapeControl.html", this.mnemonic,
            "location=no,scrollbars=no,resizable,width=408,height=212,top=0,left=" + left);
    this.window.addEventListener("load",
        D205Util.bindMethod(this, D205MagTapeControl.prototype.magTapeOnLoad));

    this.boundReadReceiveBlock = D205Util.bindMethod(this, D205MagTapeControl.prototype.readReceiveBlock);
    this.boundWriteTerminate = D205Util.bindMethod(this, D205MagTapeControl.prototype.writeTerminate);
    this.boundWriteSendBlock = D205Util.bindMethod(this, D205MagTapeControl.prototype.writeSendBlock);
    this.boundWriteInitiate = D205Util.bindMethod(this, D205MagTapeControl.prototype.writeInitiate);
    this.boundSearchComplete = D205Util.bindMethod(this, D205MagTapeControl.prototype.searchComplete);
    this.boundDirectionLampSet = D205Util.bindMethod(this, D205MagTapeControl.prototype.directionLampSet);
    this.boundTestDisabled = D205Util.bindMethod(this, D205MagTapeControl.prototype.testDisabled);

    this.currentUnit = null;            // stashed tape unit object
    this.memoryBlockCallback = null;    // stashed block-sending/receiving call-back function
    this.memoryTerminateCallback = null;// stashed memory-sending terminate call-back function
    this.suppressBMod = true;           // suppress B-modification of words on input
    this.tapeBlock = new Float64Array(20);
                                        // 20-word block buffer for tape I/O

    /* Set up the tape units from the system configuration. These can be any
    combination of Model 544 Tape Storage Units (DataReaders) and Model 560
    DataFiles. The indexes into this array are physical unit numbers used
    internally -- unit designate is set on the tape unit itself */

    this.tapeUnit = [
            null,                       // 0=not used
            null,                       // tape unit A
            null,                       // tape unit B
            null,                       // tape unit C
            null,                       // tape unit D
            null,                       // tape unit E
            null,                       // tape unit F
            null,                       // tape unit G
            null,                       // tape unit H
            null,                       // tape unit I
            null];                      // tape unit J

    for (x=1; x<this.tapeUnit.length; ++x) {
        u = this.config.getNode("MagTape.units", x);
        switch (u.type.substring(0, 2)) {
        case "MT":
            this.tapeUnit[x] = new D205MagTapeDrive(u.type, x, this.config);
            break;
        case "DF":
            this.tapeUnit[x] = new D205DataFile(u.type, x, this.config);
            break;
        default:
            this.tapeUnit[x] = null;
            break;
        } // switch u.type
    } // for x
}

/**************************************/
D205MagTapeControl.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205MagTapeControl.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the panel state */

    this.BZ = 0;                        // BZ register (lane number)
    this.T = 0;                         // T register (block number, etc.)
    this.Z = 0;                         // Z register (unit designate)

    this.controlBusy = false;           // control unit is busy with read/write/search
    this.disabled = false;              // DISABLE button pressed
};

/**************************************/
D205MagTapeControl.prototype.findDesignate = function findDesignate(u) {
    /* Searches this.tapeUnit[] to find the internal index of the unit that is
    designated as "u". If found, returns the internal index; if not found,
    returns -1. If more than one ready unit with the same designate is found,
    returns -2 */
    var index = -1;
    var unit;
    var x;

    for (x=this.tapeUnit.length-1; x>0; --x) {
        unit = this.tapeUnit[x];
        if (unit && unit.ready) {
            if (unit.unitDesignate == u) {
                if (index == -1) {
                    index = x;
                } else {
                    index = -2;
                    break;              // out of for loop
                }
            }
        }
    } // for x

    return index;
};

/**************************************/
D205MagTapeControl.prototype.directionLampSet = function directionLampSet(fwd) {
    /* Sets the forward/backward direction lamps on the control panel */

    this.forwardLamp.set(fwd ? 1 : 0);
    this.backwardLamp.set(fwd ? 0 : 1);
};

/**************************************/
D205MagTapeControl.prototype.testDisabled = function testDisabled() {
    /* Returns the current state of this.disabled. Used by D205MagTapeDrive.search */

    return this.disabled;
};

/**************************************/
D205MagTapeControl.prototype.SuppressB_onClick = function SuppressB_onclick(mask) {
    /* Handles the click to flip the B Suppress switch */

    this.suppressBSwitch.flip();
    this.suppressBMod = (this.suppressBSwitch.state == 0); // normal=on, suppress=off
    this.p.tswSuppressB = this.suppressBMod;
    this.p.config.putNode("MagTape.suppressBSwitch", !this.suppressBMod);
};

/**************************************/
D205MagTapeControl.prototype.DisableBtn_onClick = function DisableBtn_onClick(ev) {
    /* Handle the click event for the tape control DISABLE button */

    this.disabled = true;
};

/**************************************/
D205MagTapeControl.prototype.ClearBtn_onClick = function ClearBtn_onClick(ev) {
    /* Handle the click event for the tape control CLEAR button */

    this.clearUnit();
};

/**************************************/
D205MagTapeControl.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the panel unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205MagTapeControl.prototype.magTapeOnLoad = function magTapeOnLoad() {
    /* Initializes the MagTape Control window and user interface */
    var body;
    var box;
    var e;
    var x;

    this.doc = this.window.document;
    body = this.$$("PanelSurface");

    // BZ Register
    this.regBZ = new PanelRegister(this.$$("BZRegPanel"), 8, 4, "BZ_", "BZ");

    // Z Register
    this.regZ = new PanelRegister(this.$$("ZRegPanel"), 4, 4, "Z_", "Z");

    // T Register
    this.regT = new PanelRegister(this.$$("TRegPanel"), 16, 4, "T_", "T REGISTER");

    // Misc Register
    this.regMisc = new PanelRegister(this.$$("MiscRegPanel"), 15, 5, "Misc_", null);
    this.forwardLamp = this.regMisc.lamps[5];
    this.forwardLamp.setCaption("F", true);
    this.recordLamp = this.regMisc.lamps[9];
    this.recordLamp.setCaption("R", true);
    this.backwardLamp = this.regMisc.lamps[10];
    this.backwardLamp.setCaption("B", true);
    this.searchLamp = this.regMisc.lamps[14];
    this.searchLamp.setCaption("S", true);

    this.suppressBSwitch = new ToggleSwitch(body, null, null, "SuppressBSwitch",
            D205ControlConsole.offSwitchImage, D205ControlConsole.onSwitchImage);
    this.p.tswSuppressB = this.suppressBMod = !this.p.config.getNode("MagTape.suppressBSwitch");
    this.suppressBSwitch.set(this.suppressBMod ? 0 : 1);


    // Events

    this.window.addEventListener("beforeunload", D205MagTapeControl.prototype.beforeUnload);
    this.$$("ClearBtn").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeControl.prototype.ClearBtn_onClick));
    this.$$("DisableBtn").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeControl.prototype.DisableBtn_onClick));
    this.$$("SuppressBSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeControl.prototype.SuppressB_onClick));

    this.clearUnit();
};

/**************************************/
D205MagTapeControl.prototype.readTerminate = function readTerminate() {
    /* Terminates the read operation, sets the control to not-busy, and signals
    the processor we are finished with the I/O */

    this.forwardLamp.set(0);
    this.controlBusy = false;
    this.currentUnit.readTerminate();
    this.currentUnit = null;
};

/**************************************/
D205MagTapeControl.prototype.readReceiveBlock = function readReceiveBlock(block, abortRead) {
    /* Receives the next block read by the tape unit. Sends the block to the
    processor for storage in memory, updates the block counter, and if not
    finished, requests the next block from the tape. Termination is a little
    tricky here, as readTerminate() must be called to release the drive before
    the block is stored in memory (and p.executeComplete() called to advance to
    the next instruction, but if the memory call-back tells us the processor
    has been cleared, we must release the drive after the attempt to store the
    block in memory. Mess with the sequencing below at your peril */
    var lastBlock;
    var t = D205Processor.bcdBinary(this.T);

    if (abortRead || this.disabled) {
        this.readTerminate();
        this.memoryBlockCallback(null, true);
    } else {
        // Decrement the block counter in the T register:
        t = (t + 990)%1000;                 // subtract 1 from the counter field without overflow
        this.T = D205Processor.binaryBCD(t);
        this.regT.update(this.T);

        // If there are more blocks to read, request the next one
        lastBlock = (t < 10);
        if (lastBlock) {
            this.readTerminate();
            abortRead = this.memoryBlockCallback(block, true);
        } else {
            abortRead = this.memoryBlockCallback(block, false);
            if (abortRead) {            // processor was cleared
                this.readTerminate();
            } else {                    // at least one block left to go
                this.currentUnit.readBlock(this.boundReadReceiveBlock);
            }
        }
    }
};

/**************************************/
D205MagTapeControl.prototype.read = function read(unitNr, blocks, blockSender) {
    /* Initiates a read on the designated unit. "blocks" is the number of blocks
    to read in BCD; "blockSender" is the call-back function to send a block of data
    to the processor. "terminator" is the call-back function to tell the Processor
    the I/O is finished. Returns true if the control is still busy with another command
    or the unit is busy, and does not do the read */
    var result = false;                 // return value
    var unit;                           // tape unit object
    var ux;                             // internal unit index

    this.disabled = false;
    if (this.controlBusy) {
        result = true;
    } else {
        this.Z = unitNr;
        this.regZ.update(unitNr);
        ux = this.findDesignate(unitNr);
        if (ux < 0) {
            result = true;
        } else {
            this.controlBusy = true;
            this.currentUnit = unit = this.tapeUnit[ux];
            this.forwardLamp.set(1);
            this.BZ = D205Processor.binaryBCD(unit.laneNr);
            this.regBZ.update(this.BZ);
            this.T = blocks*0x10 + unitNr;
            this.regT.update(this.T);
            this.memoryBlockCallback = blockSender;
            result = unit.readInitiate(this.boundReadReceiveBlock);
            if (result) {
                this.controlBusy = false;
            }
        }
    }

    return result;
};

/**************************************/
D205MagTapeControl.prototype.writeTerminate = function writeTerminate(abortWrite) {
    /* Called by the drive after the last block is written to release the
    control unit and terminate the I/O. Note that "abortWrite" is not used, but
    exists for signature compatibility with writeSendBlock() */

    this.forwardLamp.set(0);
    this.recordLamp.set(0);
    this.controlBusy = false;
    this.memoryTerminateCallback();
    this.currentUnit = null;
};

/**************************************/
D205MagTapeControl.prototype.writeSendBlock = function writeSendBlock(abortWrite) {
    /* Called by the tape drive when it is ready for the next block to be written.
    Retrieves the next buffered block from the Processor and passes it to the drive.
    Unless this is the last block to write, the drive will call this again after
    tape motion is complete. Note that this.memoryBlockCallback() will return true
    if the processor has been cleared and the I/O must be aborted */
    var aborted;                        // true if processor aborted the I/O
    var lastBlock = abortWrite;         // true if this will be the last block
    var t = D205Processor.bcdBinary(this.T);

    // First, decrement the block counter in the T register:
    t = (t + 990)%1000;                 // subtract 1 from the counter field without overflow
    this.T = D205Processor.binaryBCD(t);
    this.regT.update(this.T);
    if (t < 10) {
        lastBlock = true;
    }

    aborted = this.memoryBlockCallback(this.tapeBlock, lastBlock);
    if (abortWrite || aborted) {
        this.writeTerminate(false);
    } else if (lastBlock || this.disabled) {
        this.currentUnit.writeBlock(this.tapeBlock, this.boundWriteTerminate, true);
    } else {
        this.currentUnit.writeBlock(this.tapeBlock, this.boundWriteSendBlock, false);
    }
};

/**************************************/
D205MagTapeControl.prototype.writeInitiate = function writeInitiate(blockReceiver, terminator) {
    /* Call-back function called by the Processor once the initial block to be
    written is buffered in one of the high-speed loops. Once this block is
    buffered, the drive can start tape motion and begin writing to tape */

    this.disabled = false;
    this.forwardLamp.set(1);
    this.recordLamp.set(1);
    this.memoryBlockCallback = blockReceiver;
    this.memoryTerminateCallback = terminator;
    this.currentUnit.writeInitiate(this.boundWriteSendBlock);
};

/**************************************/
D205MagTapeControl.prototype.write = function write(unitNr, blocks, receiveInitiate) {
    /* Initiates a write on the designated unit. "blocks" is the number of blocks
    to write in BCD; "receiveInitiate" is the call-back function to begin memory
    transfer from the processor. Returns true if the control is still busy with
    another command or the unit is busy, and does not do the write */
    var result = false;                 // return value
    var unit;                           // tape unit object
    var ux;                             // internal unit index

    if (this.controlBusy) {
        result = true;
    } else {
        this.Z = unitNr;
        this.regZ.update(unitNr);
        ux = this.findDesignate(unitNr);
        if (ux < 0) {
            result = true;
        } else {
            this.controlBusy = true;
            this.currentUnit = unit = this.tapeUnit[ux];
            this.BZ = D205Processor.binaryBCD(unit.laneNr);
            this.regBZ.update(this.BZ);
            this.T = blocks*0x10 + unitNr;
            this.regT.update(this.T);
            result = unit.writeReadyTest();
            if (result) {
                this.controlBusy = false;
            } else {
                receiveInitiate(this.boundWriteInitiate);
            }
        }
    }

    return result;
};

/**************************************/
D205MagTapeControl.prototype.searchComplete = function searchComplete(success) {
    /* Resets lamps and busy status at the completion of a search */
    var d;                              // scratch digit

    if (success) {
        // rotate T one digit right at end of successful search
        d = this.T % 0x10;
        this.T = d*0x1000 + (this.T - d)/0x10;
        this.regT.update(this.T);
    }

    this.searchLamp.set(0);
    this.forwardLamp.set(0);
    this.backwardLamp.set(0);
    this.controlBusy = false;
};

/**************************************/
D205MagTapeControl.prototype.search = function search(unitNr, laneNr, addr) {
    /* Initiates a search on the designated unit. "laneNr" is the lane number in
    BCD; "addr" is the number of the block to search for in BCD. The search
    Takes place in the control unit and drive independently of the processor.
    Returns true if the control is still busy with another command or the unit
    is busy, and does not do the search */
    var block = D205Processor.bcdBinary(addr);
    var lane = D205Processor.bcdBinary(laneNr);
    var result = false;                 // return value
    var unit;                           // tape unit object
    var ux;                             // internal unit index

    this.disabled = false;
    if (this.controlBusy) {
        result = true;
    } else {
        this.Z = unitNr;
        this.regZ.update(unitNr);
        this.BZ = laneNr;
        this.regBZ.update(laneNr);
        this.T = addr;
        this.regT.update(addr);
        ux = this.findDesignate(unitNr);
        if (ux < 0) {
            result = true;
        } else {
            this.controlBusy = true;
            unit = this.tapeUnit[ux];
            this.searchLamp.set(1);
            result = unit.search(lane, block, this.boundSearchComplete,
                    this.boundDirectionLampSet, this.boundTestDisabled);
            if (result) {
                this.controlBusy = false;
            }
        }
    }

    return result;
};

/**************************************/
D205MagTapeControl.prototype.rewind = function rewind(unitNr) {
    /* Initiates rewind of the designated unit. Returns true if the control is
    still busy with another command or the unit is busy */
    var result = false;                 // return value
    var ux;                             // internal unit index

    this.disabled = false;
    if (this.controlBusy) {
        result = true;
    } else {
        this.Z = unitNr;
        this.regZ.update(unitNr);
        this.BZ = this.T = 0;
        this.regBZ.update(0);
        this.regT.update(0);
        ux = this.findDesignate(unitNr);
        if (ux < 0) {
            result = true;
        } else {
            result = this.tapeUnit[ux].rewind();
        }
    }

    return result;
};

/**************************************/
D205MagTapeControl.prototype.clearUnit = function clearUnit() {
    /* Clears the internal state of the control unit */

    this.clear();
    this.regZ.update(0);
    this.regBZ.update(0);
    this.regT.update(0);
    this.regMisc.update(0);
    this.searchLamp.set(0);
    this.recordLamp.set(0);
    this.forwardLamp.set(0);
    this.backwardLamp.set(0);
};

/**************************************/
D205MagTapeControl.prototype.shutDown = function shutDown() {
    /* Shuts down the panel */
    var x;

    if (this.tapeUnit) {
        for (x=this.tapeUnit.length-1; x>=0; --x) {
            if (this.tapeUnit[x]) {
                this.tapeUnit[x].shutDown();
                this.tapeUnit[x] = null;
            }
        }
    }

    this.window.removeEventListener("beforeunload", D205MagTapeControl.prototype.beforeUnload);
    this.window.close();
};