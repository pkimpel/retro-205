/***********************************************************************
* retro-205/emulator D205DataFile.js
************************************************************************
* Copyright (c) 2016, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 DataFile Peripheral Unit module.
*
* Defines a magnetic tape peripheral unit type, emulating the
* Model 560 DataFile with 50 tape strips at 100 bits/inch and 60 inches/sec.
*
* Internally, tape images are maintained as a two-dimensional array of 64-bit
* floating-point words, similar to Number objects. The first dimension represents
* lanes on the tape; the second represents words in tape blocks. The words are
* implicitly grouped into 20-word blocks -- there are no block markers in the
* internal representation.
*
* The tape strips in a DataFile unit are internal to the unit and not user-
* changeable. The DataFile acted more like a slow disk or drum unit than a
* tape unit. Data could be loaded into the unit only by programatically writing
* to it. Therefore, there is no external file representation for DataFile tapes.
*
* All tape strips are considered to be calibrated with 1,000 blocks per lane --
* there is no way to specify a tape with a different number of blocks. With 50
* tape strips, there are a total of 100 lanes, numbered 0-99. Except for shorter
* tapes and more lanes, the timing and operational behavior of the DataFile is
* the same as for the Model 544 DataReader.
*
************************************************************************
* 2016-12-10  P.Kimpel
*   Original version, from B5500MagTapeDrive.js.
***********************************************************************/
"use strict";

/**************************************/
function D205DataFile(mnemonic, unitIndex, config) {
    /* Constructor for the DataFile object */
    var y = ((mnemonic.charCodeAt(2) - "A".charCodeAt(0))*30);

    this.config = config;               // System configuration object
    this.mnemonic = mnemonic;           // Unit mnemonic
    this.unitIndex = unitIndex;         // Internal unit number
    this.unitDesignate = -1;            // External unit number

    this.timer = 0;                     // setCallback() token

    this.remote = false;                // Remote switch status
    this.notWrite = false;              // Not-Write switch status

    this.clear();

    this.reelIcon = null;               // handle for the reel spinner

    this.binBlockNr = [                 // current block number for each bin tape
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    this.doc = null;
    this.window = window.open("../webUI/D205DataFile.html", mnemonic,
            "location=no,scrollbars=no,resizable,width=400,height=284,left=280,top=" + y);
    this.window.addEventListener("load",
            D205Util.bindMethod(this, D205DataFile.prototype.tapeDriveOnload), false);
}

// this.tapeState enumerations
D205DataFile.prototype.tapeLocal = 1;
D205DataFile.prototype.tapeRewinding = 2;
D205DataFile.prototype.tapeRemote = 3;

D205DataFile.prototype.density = 100;
                                        // 100 bits/inch
D205DataFile.prototype.tapeSpeed = 0.060;
                                        // tape motion speed [inches/ms]
D205DataFile.prototype.blockWords = 20;
                                        // words per block
D205DataFile.prototype.maxTapeBlocks = 1000;
                                        // max tape length on reel [blocks]
D205DataFile.prototype.maxLanes = 100;  // maximum number of lanes
D205DataFile.prototype.gapLength = 0.38;
                                        // inter-block blank tape gap (0.3) + block header (0.08) [inches]
D205DataFile.prototype.blockLength = D205DataFile.prototype.blockWords*12/D205DataFile.prototype.density +
                                                 D205DataFile.prototype.gapLength;
                                        // total block length [inches]
D205DataFile.prototype.startupTime = 6;
                                        // tape start time [ms]
D205DataFile.prototype.searchTurnaroundTime = 21;
                                        // tape turnaround time after a successful search [ms]
D205DataFile.prototype.rewindSpeed = 0.6; // D205DataFile.prototype.tapeSpeed;
                                        // rewind speed [inches/ms] - DataFile does not have high-speed rewind
D205DataFile.prototype.reelCircumference = 10*Math.PI;
                                        // max circumference of tape [inches]
D205DataFile.prototype.spinUpdateInterval = 15;
                                        // milliseconds between reel icon angle updates
D205DataFile.prototype.maxSpinAngle = 33;
                                        // max angle to rotate reel image [degrees]
D205DataFile.prototype.binWidth = 7;    // width of each tape bin in pixels
D205DataFile.prototype.binOffset = 7;   // offset to bin for lane 00 in pixels
D205DataFile.prototype.headOffsetBias = Math.floor(D205DataFile.prototype.binWidth/2) + D205DataFile.prototype.binOffset - 7;
                                        // offset of left edge of tape head at lane 00
D205DataFile.prototype.headLatchedBottom = 5;
                                        // bottom offset of tape head in latched position, pixels
D205DataFile.prototype.headUnlatchedBottom = 1;
                                        // bottom offset of tape head in unlatched position, pixels
D205DataFile.prototype.headUnlatchTime = 125;
                                        // time to unlatch the tape head, ms
D205DataFile.prototype.headAccelTime = 125;
                                        // time to accelerate/decelerate the tape head, ms
D205DataFile.prototype.headLatchTime = 125;
                                        // time to latch the tape head, ms
D205DataFile.prototype.headUpdateInterval = 15;
                                        // interval between head movement updates, ms
D205DataFile.prototype.headBinInterval = 30;
                                        // interval to move head over one lane, ms



/**************************************/
D205DataFile.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205DataFile.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the reader unit state */

    this.ready = false;                 // ready status
    this.busy = false;                  // busy status

    this.image = null;                  // tape drive "reel of tape"
    this.imgMaxBlocks = 0;              // tape image max length [blocks]
    this.imgTopBlockNr = 0;             // highest-written block number within image data
    this.imgWritten = false;            // tape image has been modified (implies writable)

    this.blockNr = 0;                   // next block number to be read on written
    this.laneNr = 0;                    // currently selected lane number
    this.reelAngle = 0;                 // current rotation angle of reel image [degrees]
    this.tapeInches = 0;                // current distance up-tape [inches]
    this.tapeMaxInches = 0;             // maximum tape length [inches]
    this.tapeState = this.tapeLocal;    // tape drive state
};

/**************************************/
D205DataFile.prototype.setUnitDesignate = function setUnitDesignate(index) {
    /* Sets this.unitDesignate from the UNIT DESIGNATE list selectedIndex value */

    if (index >= 0) {
        if (index < 9) {
            this.unitDesignate = index+1;       // units 1-9
        } else {
            this.unitDesignate = 0;             // unit 10
        }
    }
};

/**************************************/
D205DataFile.prototype.showBlockNr = function showBlockNr() {
    /* Formats and displays the current tape block number on the panel */

    this.$$("MTBlockNrText").textContent = (this.blockNr+10000).toString().substring(1);
};

/**************************************/
D205DataFile.prototype.showLaneNr = function showLaneNr() {
    /* Formats and displays the current tape lane number on the panel */

    this.$$("MTLaneNrText").textContent = (this.laneNr+100).toString().substring(1);
};

/**************************************/
D205DataFile.prototype.setHeadPosition = function setHeadPosition(binNr) {
    /* Positions the tape head at the indicated bin number */
    var offset = this.binWidth*binNr + this.headOffsetBias;

    this.$$("MTTapeHead").style.left = offset.toFixed(0) + "px";
};

/**************************************/
D205DataFile.prototype.spinReel = function spinReel(inches) {
    /* Rotates the reel image icon an appropriate amount based on the "inches"
    of tape to be moved. The rotation is limited to this.maxSpinAngle degrees
    in either direction so that movement remains apparent to the viewer */
    var binNr = Math.floor(this.laneNr/2);
    var degrees = inches/this.reelCircumference*360;
    var percentage = Math.min(Math.max(this.blockNr/this.maxTapeBlocks*100, 0), 100);

    if (degrees > this.maxSpinAngle) {
        degrees = this.maxSpinAngle;
    } else if (degrees < -this.maxSpinAngle) {
        degrees = -this.maxSpinAngle;
    }

    this.reelAngle = (this.reelAngle + degrees)%360;
    this.reelIcon.style.transform = "rotate(" + this.reelAngle.toFixed(0) + "deg)";

    this.tapeInches += inches;
    this.$$("BinMeter" + binNr).style.height = percentage.toFixed(1) + "%";
};

/**************************************/
D205DataFile.prototype.moveTape = function moveTape(inches, delay, successor) {
    /* Delays the I/O during tape motion, during which it animates the reel image
    icon. At the completion of the "delay" time in milliseconds, "successor" is
    called with no parameters. */
    var delayLeft = delay;              // milliseconds left to delay
    var direction = (inches < 0 ? -1 : 1);
    var inchesLeft = inches;            // inches left to move tape
    var lastStamp = performance.now();  // last timestamp for spinDelay

    function spinFinish() {
        this.timer = 0;
        if (inchesLeft != 0) {
            this.spinReel(inchesLeft);
        }
        successor.call(this);
    }

    function spinDelay() {
        var motion;
        var stamp = performance.now();
        var interval = stamp - lastStamp;

        if (interval <= 0) {
            interval = this.spinUpdateInterval/2;
            if (interval > delayLeft) {
                interval = delayLeft;
            }
        }

        if ((delayLeft -= interval) > this.spinUpdateInterval) {
            lastStamp = stamp;
            this.timer = setCallback(this.mnemonic, this, this.spinUpdateInterval, spinDelay);
        } else {
            this.timer = setCallback(this.mnemonic, this, delayLeft, spinFinish);
        }
        motion = inches*interval/delay;
        if (inchesLeft*direction <= 0) { // inchesLeft crossed zero
            motion = inchesLeft = 0;
        } else if (motion*direction <= inchesLeft*direction) {
            inchesLeft -= motion;
        } else {
            motion = inchesLeft;
            inchesLeft = 0;
        }

        this.spinReel(motion);
    }

    spinDelay.call(this);
};

/**************************************/
D205DataFile.prototype.setTapeReady = function setTapeReady(makeReady) {
    /* Controls the ready-state of the tape drive */
    var enabled = (this.tapeState != this.tapeRewinding);

    this.ready = this.remote && makeReady && enabled;
    this.notReadyLamp.set(this.ready ? 0 : 1);
    if (!this.ready) {
        this.designatedLamp.set(0);
    }

    if (enabled) {
        if (this.remote) {
            this.tapeState = this.tapeRemote;
        } else {
            this.busy = false;          // forced reset
            this.tapeState = this.tapeLocal;
        }
    }
};

/**************************************/
D205DataFile.prototype.selectLane = function selectLane(laneNr, successor) {
    /* Selects the specified binary lane number. If the new lane is located in
    another bin, moves the tape head to that bin. When finished, calls the
    "successor" function */
    var binNr;
    var forward;
    var lastStamp;
    var newBinNr;

    function selectLaneFinish() {
        this.timer = 0;
        this.laneNr = laneNr;
        this.showLaneNr();
        successor.call(this);
    }

    function latchHead() {
        this.blockNr = this.binBlockNr[newBinNr];
        this.showBlockNr();
        this.$$("MTTapeHead").style.bottom = this.headLatchedBottom.toString() + "px";
        this.$$("MTTapeHeadRod").style.bottom = (this.headLatchedBottom+0).toString() + "px";
        this.timer = setCallback(this.mnemonic, this, this.headLatchTime, selectLaneFinish);
    }

    function traverseBins() {
        var stamp = performance.now();
        var interval = stamp - lastStamp;
        var bins = Math.max(interval/this.headBinInterval, 0);

        lastStamp = stamp;
        if (forward) {
            binNr += bins;
            if (binNr >= newBinNr) {
                this.setHeadPosition(newBinNr);
                this.timer = setCallback(this.mnemonic, this, this.headAccelTime, latchHead);
            } else {
                this.setHeadPosition(binNr);
                this.laneNr = Math.round(binNr*2);
                this.showLaneNr();
                this.timer = setCallback(this.mnemonic, this, this.headBinInterval, traverseBins);
            }
        } else {
            binNr -= bins;
            if (binNr <= newBinNr) {
                this.setHeadPosition(newBinNr);
                this.timer = setCallback(this.mnemonic, this, this.headAccelTime, latchHead);
            } else {
                this.setHeadPosition(binNr);
                this.laneNr = Math.round(binNr*2);
                this.showLaneNr();
                this.timer = setCallback(this.mnemonic, this, this.headBinInterval, traverseBins);
            }
        }
    }

    function startTraversal() {
        lastStamp = performance.now();
        forward = newBinNr > binNr;
        this.timer = setCallback(this.mnemonic, this, this.headBinInterval, traverseBins);
    }

    function unlatchHead() {
        this.$$("MTTapeHead").style.bottom = this.headUnlatchedBottom.toString() + "px";
        this.$$("MTTapeHeadRod").style.bottom = (this.headUnlatchedBottom+0).toString() + "px";
        this.timer = setCallback(this.mnemonic, this, this.headAccelTime, startTraversal);
    }

    if (this.timer) {
        clearCallback(this.timer);
        this.timer = 0;
    }

    if (this.laneNr == laneNr) {
        successor.call(this);
    } else {
        this.binBlockNr[binNr] = this.blockNr;
        binNr = Math.floor(this.laneNr/2);
        newBinNr = Math.floor(laneNr/2);
        if (binNr == newBinNr) {
            selectLaneFinish.call(this);
        } else {
            this.timer = setCallback(this.mnemonic, this, this.headUnlatchTime, unlatchHead);
        }
    }

};

/**************************************/
D205DataFile.prototype.tapeRewind = function tapeRewind() {
    /* Rewinds the tape. Makes the drive not-ready and delays for an appropriate
    amount of time depending on how far up-tape we are. If the unit is in remote,
    then readies the unit again when the rewind is complete */
    var binNr;
    var lastStamp;

    function rewindFinish() {
        this.timer = 0;
        this.busy = false;
        this.tapeState = this.tapeLocal;
        D205Util.removeClass(this.$$("MTRewindingLight"), "annunciatorLit");
        this.setTapeReady(this.remote);
    }

    function laneFinish() {

        this.binBlockNr[binNr] = this.blockNr = 0;
        this.showBlockNr();
        this.$$("BinMeter" + binNr).style.height = "0";
        if (this.laneNr < 2) {
            this.selectLane(99, rewindStart);
        } else if (this.laneNr > 3) {
            this.selectLane(this.laneNr-2, rewindStart);
        } else {
            this.selectLane(0, rewindFinish);
        }
    }

    function rewindDelay() {
        var inches;
        var stamp = performance.now();
        var interval = stamp - lastStamp;

        if (interval <= 0) {
            interval = this.spinUpdateInterval/2;
        }

        if (this.tapeState != this.tapeRewinding) {
            this.selectLane(0, rewindFinish);   // STOP REWIND was clicked
            this.binBlockNr[binNr] = this.blockNr;
        } else if (this.tapeInches <= 0) {
            laneFinish.call(this);
        } else {
            inches = interval*this.rewindSpeed;
            this.blockNr = Math.round(this.tapeInches/this.blockLength);
            this.showBlockNr();
            lastStamp = stamp;
            this.timer = setCallback(this.mnemonic, this, this.spinUpdateInterval, rewindDelay);
            this.spinReel(-inches);
        }
    }

    function rewindStart() {
        lastStamp = performance.now();
        binNr = Math.floor(this.laneNr/2);
        this.tapeInches = this.blockNr*this.blockLength;
        this.timer = setCallback(this.mnemonic, this, this.spinUpdateInterval, rewindDelay);
    }

    if (this.timer) {
        clearCallback(this.timer);
        this.timer = 0;
    }

    if (this.tapeState != this.tapeRewinding) {
        this.busy = true;
        this.tapeState = this.tapeRewinding;
        this.setTapeReady(false);
        this.designatedLamp.set(0);
        D205Util.addClass(this.$$("MTRewindingLight"), "annunciatorLit");
        this.selectLane(1, rewindStart);
    }
};


/**************************************/
D205DataFile.prototype.RewindBtn_onclick = function RewindBtn_onclick(ev) {
    /* Handle the click event for the REWIND button */

    if (!this.busy && this.tapeState != this.tapeRewinding) {
        this.tapeRewind();
    }
};

/**************************************/
D205DataFile.prototype.RewindStopBtn_onclick = function RewindStopBtn_onclick(ev) {
    /* Handle the click event for the STOP REWIND button */

    if (this.tapeState == this.tapeRewinding) {
        this.tapeState = this.tapeLocal;
    }
};

/**************************************/
D205DataFile.prototype.UnitDesignate_onchange = function UnitDesignate_onchange(ev) {
    /* Handle the change event for the UNIT DESIGNATE select list */
    var prefs = this.config.getNode("MagTape.units", this.unitIndex);
    var sx = ev.target.selectedIndex;

    this.setUnitDesignate(sx);
    prefs.designate = sx;
    this.config.putNode("MagTape.units", prefs, this.unitIndex);
};

/**************************************/
D205DataFile.prototype.RemoteSwitch_onclick = function RemoteSwitch_onclick(ev) {
    /* Handle the click event for the REMOTE button */
    var prefs = this.config.getNode("MagTape.units", this.unitIndex);

    this.remoteSwitch.flip();
    this.remote = (this.remoteSwitch.state != 0);
    this.setTapeReady(this.remote);
    prefs.remoteSwitch = this.remote;
    this.config.putNode("MagTape.units", prefs, this.unitIndex);
};

/**************************************/
D205DataFile.prototype.NotWriteSwitch_onclick = function NotWriteSwitch_onclick(ev) {
    /* Handle the click event for the WRITE RING button */
    var prefs = this.config.getNode("MagTape.units", this.unitIndex);

    this.notWriteSwitch.flip();
    this.notWrite = (this.notWriteSwitch.state != 0);
    this.notWriteLamp.set(this.notWrite ? 1 : 0);
    prefs.notWriteSwitch = this.notWrite;
    this.config.putNode("MagTape.units", prefs, this.unitIndex);
};

/**************************************/
D205DataFile.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205DataFile.prototype.buildBins = function buildBins() {
    /* Creates the 50 bin bars to represent the individual tape strips */
    var bin;
    var binDiv = this.$$("MTBinDiv");
    var blockNr;
    var maxBins = Math.floor(this.maxLanes/2);
    var meter;
    var x;

    for (x=0; x<maxBins; ++x) {
        bin = document.createElement("div");
        bin.className = "tapeBin";
        bin.style.left = (x*this.binWidth + this.binOffset).toString() + "px";
        binDiv.appendChild(bin);

        meter = document.createElement("div");
        meter.className = "binMeter";
        meter.id = "BinMeter" + x;
        this.binBlockNr[x] = blockNr = Math.floor(Math.random()*this.maxTapeBlocks);
        meter.style.height = (blockNr*100/this.maxTapeBlocks).toString() + "%";
        bin.appendChild(meter);
    }
};

/**************************************/
D205DataFile.prototype.tapeDriveOnload = function tapeDriveOnload() {
    /* Initializes the reader window and user interface */
    var body;
    var prefs = this.config.getNode("MagTape.units", this.unitIndex);

    this.doc = this.window.document;
    this.doc.title = "retro-205 DataFile " + this.mnemonic;

    body = this.$$("MTDiv");
    this.reelIcon = this.$$("MTReel");
    this.buildBins();

    this.unitDesignateList = this.$$("UnitDesignate");
    this.unitDesignateList.selectedIndex = prefs.designate;
    this.setUnitDesignate(prefs.designate);

    this.designatedLamp = new ColoredLamp(body, null, null, "DesignatedLamp", "orangeLamp", "orangeLit");
    this.notReadyLamp = new ColoredLamp(body, null, null, "NotReadyLamp", "orangeLamp", "orangeLit");
    this.notWriteLamp = new ColoredLamp(body, null, null, "NotWriteLamp", "orangeLamp", "orangeLit");

    this.remoteSwitch = new ToggleSwitch(body, null, null, "RemoteSwitch",
            D205ControlConsole.offSwitchClass, D205ControlConsole.onSwitchClass);
    this.remote = prefs.remoteSwitch;
    this.remoteSwitch.set(this.remote ? 1 : 0);

    this.notWriteSwitch = new ToggleSwitch(body, null, null, "NotWriteSwitch",
            D205ControlConsole.offSwitchClass, D205ControlConsole.onSwitchClass);
    this.notWrite = prefs.notWriteSwitch;
    this.notWriteSwitch.set(this.notWrite ? 1 : 0);

    this.setTapeReady(this.remote);
    this.selectLane(this.maxLanes-1, function() {
        this.selectLane(Math.round(this.maxLanes/2), function() {})
    });

    this.window.addEventListener("beforeunload",
            D205DataFile.prototype.beforeUnload, false);
    this.$$("RewindBtn").addEventListener("click",
            D205Util.bindMethod(this, D205DataFile.prototype.RewindBtn_onclick), false);
    this.$$("RewindStopBtn").addEventListener("click",
            D205Util.bindMethod(this, D205DataFile.prototype.RewindStopBtn_onclick), false);
    this.$$("RemoteSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205DataFile.prototype.RemoteSwitch_onclick), false);
    this.$$("NotWriteSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205DataFile.prototype.NotWriteSwitch_onclick), false);
    this.unitDesignateList.addEventListener("change",
            D205Util.bindMethod(this, D205DataFile.prototype.UnitDesignate_onchange), false);
};

/**************************************/
D205DataFile.prototype.readBlock = function readBlock(receiveBlock) {
    /* Reads the next block from the tape. If at EOT, makes the drive not ready
    and terminates the read. After delaying for tape motion, calls the receiveBlock
    callback function to pass the block to the control unit and thence the processor */
    var wx = this.blockNr*this.blockWords;

    if (this.blockNr >= this.imgMaxBlocks) {
        this.setTapeReady(false);
        this.designatedLamp.set(0);
        this.busy = false;
        receiveBlock(null, true);       // terminate the I/O
    } else {
        this.moveTape(this.blockLength, this.blockLength/this.tapeSpeed, function readBlockComplete() {
            ++this.blockNr;
            this.showBlockNr();
            receiveBlock(this.image[this.laneNr].subarray(wx, wx+this.blockWords), false);
        });
    }
};

/**************************************/
D205DataFile.prototype.readTerminate = function readTerminate() {
    /* Terminates a read operation on the tape drive and makes it not-busy */

    this.designatedLamp.set(0);
    this.busy = false;
};

/**************************************/
D205DataFile.prototype.readInitiate = function readInitiate(receiveBlock) {
    /* Initiates a read operation on the unit. If the drive is busy or not ready,
    returns true. Otherwise, delays for the start-up time of the drive and calls
    readBlock() to read the next block and send it to the Processor */
    var result = false;

    if (this.busy) {
        result = true;                  // report unit busy
    } else if (!this.ready) {
        result = true;                  // report unit not ready
    } else {
        this.busy = true;
        this.designatedLamp.set(1);
        setCallback(this.mnemonic, this, this.startupTime, this.readBlock, receiveBlock);
    }
    //console.log(this.mnemonic + " read:             result=" + result.toString());

    return result;
};

/**************************************/
D205DataFile.prototype.writeBlock = function writeBlock(block, sendBlock, lastBlock) {
    /* Writes the next block from the tape. If at EOT, makes the drive not ready
    and terminates the write. Calls the receiveBlock callback function to pass the
    block to the processor */
    var lane = this.image[this.laneNr];
    var wx = this.blockNr*this.blockWords;
    var x;

    if (this.blockNr >= this.imgMaxBlocks) {
        this.setTapeReady(false);
        this.designatedLamp.set(0);
        this.busy = false;
        sendBlock(true);                // terminate the I/O
    } else {
        // If the NOT WRITE switch is on, do not copy the block data to the tape image
        if (!this.notWrite) {
            this.imgWritten = true;
            if (this.blockNr > this.imgTopBlockNr) {
                this.imgTopBlockNr = this.blockNr;
            }
            for (x=0; x<this.blockWords; ++x) {
                lane[wx+x] = block[x];
            }
        }

        // Tape motion occurs regardless of the NOT WRITE switch
        this.moveTape(this.blockLength, this.blockLength/this.tapeSpeed, function writeBlockComplete() {
            ++this.blockNr;
            this.showBlockNr();
            sendBlock(false);
            if (lastBlock) {
                this.designatedLamp.set(0);
                this.busy = false;
            }
        });
    }
};

/**************************************/
D205DataFile.prototype.writeInitiate = function writeInitiate(sendBlock, lastBlock) {
    /* Initiates a write operation on the unit. Delays for the start-up time of the drive
    and calls writeBlock() to retrieve data from the Processor and write it to tape */

    setCallback(this.mnemonic, this, this.startupTime, sendBlock, false);
};

/**************************************/
D205DataFile.prototype.writeReadyTest = function writeReadyTest() {
    /* Initiates a read operation on the unit. If the drive is busy or not ready,
    returns true. Otherwise, delays for the start-up time of the driver and calls
    readBlock() to read the next block and send it to the Processor */
    var result = false;

    if (this.busy) {
        result = true;                  // report unit busy
    } else if (!this.ready) {
        result = true;                  // report unit not ready
    } else {
        this.busy = true;
        this.designatedLamp.set(1);
    }

    return result;
};

/**************************************/
D205DataFile.prototype.search = function search(laneNr, targetBlock, complete, lampSet, testDisabled) {
    /* Initiates a search operation on the unit. If the drive is busy or not ready,
    returns true.  Otherwise, searches forward until past the target block, then
    reverses direction and searches backward to the target block. Finally, calls
    the "complete" function. The reason for going one block too far is that the
    control unit had to read the block header to know where it was, so it had to
    go past the header for the target block in order to find it. If the target
    block number is after the last block on the tape, the drive is made not ready */
    var delay = this.blockLength/this.tapeSpeed;
    var result = false;

    function finishSearch() {
        /* Wraps up the search and sets completion status */

        this.busy = false;
        this.designatedLamp.set(0);
        if (this.blockNr > this.imgMaxBlocks) {
            this.setTapeReady(false);
        }
        complete(this.blockNr == targetBlock);
    }

    function searchBackward() {
        /* While the tape is beyond the target block, moves backward one block and
        is called by moveTape to evaluate the new block position */

        --this.blockNr;
        this.showBlockNr();
        if (testDisabled()) {
            finishSearch.call(this);
        } else if (this.blockNr > targetBlock) {
            this.moveTape(-this.blockLength, delay, searchBackward);
        } else {
            finishSearch.call(this);
        }
    }

    function searchForward() {
        /* Searches forward until the tape is beyond the target block, then
        reverses direction and does a backward search */

        ++this.blockNr;
        this.showBlockNr();
        if (testDisabled()) {
            finishSearch.call(this);
        } else if (this.blockNr > this.imgMaxBlocks) {
            finishSearch.call(this);
        } else if (this.blockNr <= targetBlock) {
            this.moveTape(this.blockLength, delay, searchForward);
        } else {
            // We have searched forward (or are already forward) of the target block.
            // Now change direction and search backwards to the target.
            lampSet(false);             // indicate backward motion
            this.moveTape(-this.blockLength, this.searchTurnaroundTime, searchBackward);
        }
    }

    if (this.busy) {
        result = true;                  // report unit busy
    } else if (!this.ready) {
        result = true;                  // report unit not ready
    } else {
        this.busy = true;
        this.laneNr = laneNr & 0x01;    // TSU uses only low-order lane bit
        this.designatedLamp.set(1);

        // Begin by searching forward until we are past the target block
        lampSet(true);                  // indicate forward motion
        this.moveTape(this.blockLength, delay+this.startupTime, searchForward);
    }
    //console.log(this.mnemonic + " search:           result=" + result.toString());

    if (result) {
        complete(false);
    }
    return result;
};

/**************************************/
D205DataFile.prototype.rewind = function rewind() {
    /* The DataFile does not support programmatic rewind, so we simply ignore the
    command and return false */

    //console.log(this.mnemonic + " rewind ignored");
    return false;
};

/**************************************/
D205DataFile.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.timer) {
        clearCallback(this.timer);
    }
    this.window.removeEventListener("beforeunload", D205DataFile.prototype.beforeUnload, false);
    this.window.close();
    if (this.loadWindow && !this.loadWindow.closed) {
        this.loadWindow.close();
    }
};
