/***********************************************************************
* retro-205/emulator D205MagTapeDrive.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Magnetic Tape Drive Peripheral Unit module.
*
* Defines a magnetic tape drive peripheral unit type, emulating the
* Model 544 tape transport at 100 bits/inch and 60 inches/sec.
*
* Internally, tape images are maintained as a two-dimensional array of 64-bit
* floating-point words, similar to Number objects. The first dimension represents
* lanes on the tape; the second represents words in tape blocks. The words are
* implicitly grouped into 20-word blocks -- there are no block markers in the
* internal representation.
*
* External tape images are ordinary text files in comma-separated variable (CSV)
* format. Each line in the file represents one block for both lanes. The first
* 20 fields in the line represent the words for the block in lane 0; the next 20
* fields represent the words for the block in lane 1. Each field must be a decimal
* number of up to 11 digits. A "-" preceding a number will cause a 1 to be OR-ed
* into the low-order bit of the sign digit in the word. Blank or empty fields will
* be treated as if they contained zeroes. Fields containing non-decimal values
* will also be treated as zeroes. Lines containing fewer than 40 fields will be
* padded as necessary with additional zero words; Lines containing more than 40
* fields will be truncated. An entirely blank line will be treated as one with 40
* words of zeroes. Lines of zero length or consisting only of spaces are ignored.
*
* All tapes are considered to be calibrated with 10,000 blocks per lane -- there
* is no way to specify a tape with a different number of blocks. If an external
* tape image contains fewer than 10,000 blocks, it will be padded as necessary
* with blocks of zero words in both lanes to 10,000 blocks. Tape images with
* more than 10,000 blocks will be truncated to 10,000. When saving an internal
* tape image to a file, blocks at the end containing all zeroes in both lanes
* will be trimmed from the external image.
*
************************************************************************
* 2015-06-23  P.Kimpel
*   Original version, from B5500MagTapeDrive.js.
***********************************************************************/
"use strict";

/**************************************/
function D205MagTapeDrive(mnemonic, unitIndex) {
    /* Constructor for the MagTapeDrive object */
    var y = ((mnemonic.charCodeAt(2) - "A".charCodeAt(0))*30);

    this.mnemonic = mnemonic;           // Unit mnemonic
    this.unitIndex = unitIndex;         // Internal unit number
    this.unitDesignate = unitIndex;     // External unit number

    this.timer = 0;                     // setCallback() token

    this.remote = false;                // Remote switch status
    this.rewindReady = true;            // Rewind-Ready switch status
    this.notWrite = false;              // Not-Write switch status

    this.clear();

    this.loadWindow = null;             // handle for the tape loader window
    this.reelBar = null;                // handle for tape-full meter
    this.reelIcon = null;               // handle for the reel spinner

    this.window = window.open("", mnemonic, "resizable,width=140,height=140");
    if (this.window) {
        this.shutDown();                // destroy any previously-existing window
        this.window = null;
    }
    this.doc = null;
    this.window = window.open("../webUI/D205MagTapeDrive.html", mnemonic,
            "location=no,scrollbars=no,resizable,width=480,height=184,left=280,top=" + y);
    this.window.addEventListener("load",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.tapeDriveOnload), false);
}

// this.tapeState enumerations
D205MagTapeDrive.prototype.tapeUnloaded = 0;
D205MagTapeDrive.prototype.tapeLocal = 1;
D205MagTapeDrive.prototype.tapeRewinding = 2;
D205MagTapeDrive.prototype.tapeRemote = 3;

D205MagTapeDrive.prototype.density = 100;
                                        // 800 bits/inch
D205MagTapeDrive.prototype.tapeSpeed = 0.060;
                                        // tape motion speed [inches/ms]
D205MagTapeDrive.prototype.blockWords = 20;
                                        // words per block
D205MagTapeDrive.prototype.maxTapeBlocks = 10000;
                                        // max tape length on reel [blocks]
D205MagTapeDrive.prototype.gapLength = 0.38;
                                        // inter-block blank tape gap (0.3) + block header (0.08) [inches]
D205MagTapeDrive.prototype.blockLength = D205MagTapeDrive.prototype.blockWords*12/D205MagTapeDrive.prototype.density +
                                                 D205MagTapeDrive.prototype.gapLength;
                                        // total block length [inches]
D205MagTapeDrive.prototype.startupTime = 6;
                                        // tape start time [ms]
D205MagTapeDrive.prototype.searchTurnaroundTime = 21;
                                        // tape turnaround time after a successful search [ms]
D205MagTapeDrive.prototype.rewindSpeed = 0.132;
                                        // rewind speed [inches/ms]
D205MagTapeDrive.prototype.reelCircumference = 10*Math.PI;
                                        // max circumference of tape [inches]
D205MagTapeDrive.prototype.spinUpdateInterval = 15;
                                        // milliseconds between reel icon angle updates
D205MagTapeDrive.prototype.maxSpinAngle = 33;
                                        // max angle to rotate reel image [degrees]


/**************************************/
D205MagTapeDrive.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205MagTapeDrive.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the reader unit state */

    this.ready = false;                 // ready status
    this.busy = false;                  // busy status

    this.image = null;                  // tape drive "reel of tape"
    this.imgMaxBlocks = 0;              // tape image max length [blocks]
    this.imgTopBlockNr = 0;             // highest-written block number within image data
    this.imgWritten = false;            // tape image has been modified (implies writable)

    this.atBOT = true;                  // true if tape at BOT
    this.atEOT = false;                 // true if tape at EOT
    this.blockNr = 0;                   // next block number to be read on written
    this.laneNr = 0;                    // currently selected lane number
    this.reelAngle = 0;                 // current rotation angle of reel image [degrees]
    this.tapeInches = 0;                // current distance up-tape [inches]
    this.tapeMaxInches = 0;             // maximum tape length [inches]
    this.tapeState = this.tapeUnloaded; // tape drive state
};

/**************************************/
D205MagTapeDrive.prototype.showBlockNr = function showBlockNr() {
    /* Formats and displays the current tape block number on the panel */

    this.$$("MTBlockNrText").textContent = (this.blockNr+10000).toString().substring(1);
};

/**************************************/
D205MagTapeDrive.prototype.spinReel = function spinReel(inches) {
    /* Rotates the reel image icon an appropriate amount based on the "inches"
    of tape to be moved. The rotation is limited to this.maxSpinAngle degrees
    in either direction so that movement remains apparent to the viewer */
    var circumference = this.reelCircumference*(1 - this.tapeInches/this.tapeMaxInches/2);
    var degrees = inches/circumference*360;

    if (degrees > this.maxSpinAngle) {
        degrees = this.maxSpinAngle;
    } else if (degrees < -this.maxSpinAngle) {
        degrees = -this.maxSpinAngle;
    }

    this.reelAngle = (this.reelAngle + degrees)%360;
    this.reelIcon.style["-webkit-transform"] = "rotate(" + this.reelAngle.toFixed(0) + "deg)";  // temp for Chrome
    this.reelIcon.style.transform = "rotate(" + this.reelAngle.toFixed(0) + "deg)";

    this.tapeInches += inches;
    if (this.tapeInches < this.tapeMaxInches) {
        this.reelBar.value = this.tapeMaxInches - this.tapeInches;
    } else {
        this.reelBar.value = 0;
    }
};

/**************************************/
D205MagTapeDrive.prototype.moveTape = function moveTape(inches, delay, callBack) {
    /* Delays the I/O during tape motion, during which it animates the reel image
    icon. At the completion of the "delay" time in milliseconds, "callBack" is
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
        callBack.call(this);
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
D205MagTapeDrive.prototype.setAtBOT = function setAtBOT(atBOT) {
    /* Controls the at-Beginning-of-Tape state of the tape drive */

    if (atBOT ^ this.atBOT) {
        this.atBOT = atBOT;
        if (!atBOT) {
            D205Util.removeClass(this.$$("MTAtBOTLight"), "annunciatorLit");
        } else {
            this.blockNr = 0;
            this.showBlockNr();
            this.tapeInches = 0;
            this.reelAngle = 0;
            D205Util.addClass(this.$$("MTAtBOTLight"), "annunciatorLit");
            this.reelBar.value = this.tapeMaxInches;
            this.reelIcon.style.transform = "none";
            this.reelIcon.style["-webkit-transform"] = "none";          // temp for Chrome
        }
    }
};

/**************************************/
D205MagTapeDrive.prototype.setAtEOT = function setAtEOT(atEOT) {
    /* Controls the at-End-of-Tape state of the tape drive */

    if (atEOT ^ this.atEOT) {
        this.atEOT = atEOT;
        if (!atEOT) {
            D205Util.removeClass(this.$$("MTAtEOTLight"), "annunciatorLit");
        } else {
            D205Util.addClass(this.$$("MTAtEOTLight"), "annunciatorLit");
            this.reelBar.value = 0;
        }
    }
};

/**************************************/
D205MagTapeDrive.prototype.setTapeReady = function setTapeReady(makeReady) {
    /* Controls the ready-state of the tape drive */
    var enabled = (this.tapeState != this.tapeUnloaded) &&
                  (this.tapeState != this.tapeRewinding);

    this.ready = this.remote && makeReady && enabled;
    this.notReadyLamp.set(this.ready ? 0 : 1);
    if (enabled) {
        if (this.remote) {
            this.tapeState = this.tapeRemote;
        } else {
            this.busy = false;          // forced reset
            this.designatedLamp.set(0);
            this.tapeState = this.tapeLocal;
        }
    }
};

/**************************************/
D205MagTapeDrive.prototype.setTapeUnloaded = function setTapeUnloaded() {
    /* Controls the loaded/unloaded-state of the tape drive */

    if (this.tapeState == this.tapeLocal && this.atBOT) {
        this.tapeState = this.tapeUnloaded;
        this.image = null;                  // release the tape image to GC
        this.imgMaxBlocks = 0;
        this.imgTopBlockNr = 0;
        this.busy = false;
        this.setTapeReady(false);
        this.setAtBOT(false);
        this.setAtEOT(false);
        this.reelBar.value = 0;
        this.reelIcon.style.visibility = "hidden";
        this.$$("MTFileName").value = "";
        D205Util.addClass(this.$$("MTUnloadedLight"), "annunciatorLit");
        D205Util.removeClass(this.$$("MTBlockNrLight"), "annunciatorLit");
        if (this.timer) {
            clearCallback(this.timer);
            this.timer = 0;
        }
    }
};

/**************************************/
D205MagTapeDrive.prototype.loadTape = function loadTape() {
    /* Loads a tape into memory based on selections in the MTLoad window */
    var $$$ = null;                     // getElementById shortcut for loader window
    var doc = null;                     // loader window.document
    var file = null;                    // FileReader instance
    var fileSelect = null;              // file picker element
    var mt = this;                      // this D205MagTapeDrive instance
    var tapeBlocks = 0;                 // selected tape length in blocks
    var win = this.window.open("D205MagTapeLoadPanel.html", this.mnemonic + "Load",
            "location=no,scrollbars=no,resizable,width=508,height=48,left=" +
            (this.window.screenX+16) +",top=" + (this.window.screenY+16));

    function fileSelector_onChange(ev) {
        /* Handle the <input type=file> onchange event when a file is selected */
        var fileName;
        var x;

        file = ev.target.files[0];
        fileName = file.name;
    }

    function finishLoad() {
        /* Finishes the tape loading process and closes the loader window */

        mt.blockNr = 0;
        mt.imgMaxBlocks = tapeBlocks;
        mt.imgWritten = false;
        mt.tapeMaxInches = tapeBlocks*mt.blockLength;
        mt.reelBar.max = mt.tapeMaxInches
        mt.reelBar.value = mt.tapeMaxInches;
        mt.setAtBOT(true);
        mt.setAtEOT(false);
        mt.tapeState = mt.tapeLocal;    // setTapeReady() requires it not be unloaded
        mt.setTapeReady(true);
        mt.reelIcon.style.visibility = "visible";
        D205Util.removeClass(mt.$$("MTUnloadedLight"), "annunciatorLit");
        D205Util.addClass(mt.$$("MTBlockNrLight"), "annunciatorLit");
        mt.showBlockNr();
        win.close();
    }

    function blankLoader() {
        /* Loads a blank tape image into the drive. Note that the default value
        for all typed arrays is binary zeroes */
        var x;

        tapeBlocks = mt.maxTapeBlocks;
        mt.image = [new Float64Array(tapeBlocks*mt.blockWords),
                    new Float64Array(tapeBlocks*mt.blockWords)];
        mt.imgTopBlockNr = 0;
        finishLoad();
    }

    function textLoader_onload(ev) {
        /* Loads a text image as comma-delimited decimal word values. Note that
        the default value for all typed arrays is binary zeroes, so zero or
        missing words are not stored in the internal tape image */
        var block;                      // ANSI text of current block
        var blockLength;                // length of current ASCII block
        var blocks = 0;                 // tape blocks occupied by image data
        var buf = ev.target.result;     // ANSI tape image buffer
        var bufLength = buf.length;     // length of ANSI tape image buffer
        var eolRex = /([^\n\r\f]*)((:?\r[\n\f]?)|\n|\f)?/g;
        var index = 0;                  // char index into tape image buffer for next block
        var ix = 0;                     // word index into mt.image
        var lx;                         // lane index
        var match;                      // result of eolRex.exec()
        var tx;                         // char index into ANSI block text
        var wx;                         // word index within current block

        function parseWord() {
            /* Parses the next word from the block text and returns its value as BCD */
            var cx;                     // offset to next comma
            var text;                   // text of parsed word
            var v;                      // parsed decimal value
            var w = 0;                  // result BCD word

            if (tx < blockLength) {
                cx = block.indexOf(",", tx);
                if (cx < 0) {
                    cx = blockLength;
                }
                text = block.substring(tx, cx).trim();
                if (text.length > 0) {
                    v = parseInt(text, 16);     // parse as hex (BCD)
                    if (!isNaN(v)) {
                        if (v > 0) {
                            w = v % 0x100000000000;
                        } else if (v < 0) {
                            // The number was specified as negative: if the
                            // sign bit is not already set, then set it.
                            w = (-v) % 0x100000000000;
                            if (w % 0x20000000000 < 0x10000000000) {
                                w += 0x10000000000;
                            }
                        }
                    }
                }

                tx = cx+1;
            }

            return w;
        }

        tapeBlocks = mt.maxTapeBlocks;
        mt.image = [new Float64Array(tapeBlocks*mt.blockWords),
                    new Float64Array(tapeBlocks*mt.blockWords)];
        do {
            eolRex.lastIndex = index;
            match = eolRex.exec(buf);
            if (!match) {
                break;
            } else {
                index += match[0].length;
                block = match[1].trim();
                blockLength = block.length;
                if (blockLength > 0) {
                    ++blocks;
                    lx = tx = wx = 0;

                    while (tx < blockLength && lx < 2) {
                        mt.image[lx][ix+wx] = parseWord();
                        if (++wx >= mt.blockWords) {
                            wx = 0;
                            ++lx;
                        }
                    } // while

                    ix += mt.blockWords;
                }
            }
        } while (index < bufLength);

        mt.imgTopBlockNr = blocks-1;
        finishLoad();
    }

    function tapeLoadOK(ev) {
        /* Handler for the OK button. Does the actual tape load. If a tape-image
        file has been selected, loads that file; otherwise loads a blank tape */
        var tape;

        if (!file) {
            mt.$$("MTFileName").value = "(blank tape)";
            blankLoader();
        } else {
            mt.$$("MTFileName").value = file.name;
            tape = new FileReader();
            tape.onload = textLoader_onload;
            tape.readAsText(file);
        }
    }

    function tapeLoadOnload (ev) {
        /* Driver for the tape loader window */
        var de;

        doc = win.document;
        doc.title = "retro-205 " + mt.mnemonic + " Tape Loader";
        de = doc.documentElement;
        $$$ = function $$$(id) {
            return doc.getElementById(id);
        };

        fileSelect = $$$("MTLoadFileSelector");
        fileSelect.addEventListener("change", fileSelector_onChange, false);

        $$$("MTLoadOKBtn").addEventListener("click", tapeLoadOK, false);
        $$$("MTLoadCancelBtn").addEventListener("click", function loadCancelBtn(ev) {
            file = null;
            mt.$$("MTFileName").value = "";
            win.close();
        }, false);

        win.focus();
        win.resizeBy(de.scrollWidth - win.innerWidth,
                     de.scrollHeight - win.innerHeight);
    }

    // Outer block of loadTape
    if (this.loadWindow && !this.loadWindow.closed) {
        this.loadWindow.close();
    }
    this.loadWindow = win;
    win.addEventListener("load", tapeLoadOnload, false);
    win.addEventListener("unload", function tapeLoadUnload(ev) {
        this.loadWindow = null;
    }, false);
};

/**************************************/
D205MagTapeDrive.prototype.unloadTape = function unloadTape() {
    /* Reformats the tape image data as ASCII text and displays it in a new
    window so the user can save or copy/paste it elsewhere */
    var doc = null;                     // loader window.document
    var mt = this;                      // tape drive object
    var win = this.window.open("./D205FramePaper.html", this.mnemonic + "-Unload",
            "location=no,scrollbars=yes,resizable,width=800,height=600");

    function unloadDriver() {
        /* Converts the tape image to ASCII once the window has displayed the
        waiting message */
        var buf;                        // ANSI tape image buffer
        var image = mt.image;           // tape image data
        var imgLength;                  // active words in tape image
        var imgTop = mt.imgTopBlockNr;  // tape image last block number
        var lx;                         // lane index
        var table;                      // even/odd parity translate table
        var tape;                       // <pre> element to receive tape data
        var w;                          // current image word
        var wx;                         // word index within block
        var x = 0;                      // image data index

        doc = win.document;
        doc.title = "retro-205 " + mt.mnemonic + " Unload Tape";
        tape = doc.getElementById("Paper");
        while (tape.firstChild) {               // delete any existing <pre> content
            tape.removeChild(tape.firstChild);
        }

        // First, trim zeroes from the end of both lanes
        x = (imgTop+1)*mt.blockWords-1;
        while (x > 0) {
            if (image[0][x] == 0 && image[1][x] == 0) {
                --x;
            } else {
                break;  // out of while loop
            }
        }
        imgTop = Math.floor(x/mt.blockWords);
        imgLength = (imgTop+1)*mt.blockWords;

        // Next, step through the blocks in both lanes and format the CSV line
        for (x=0; x<imgLength; x+=mt.blockWords) {
            buf = "";
            for (lx=0; lx<2; ++lx) {
                for (wx=0; wx<mt.blockWords; ++wx) {
                    w = image[lx][x+wx];
                    if (w == 0) {
                        buf += ",";
                    } else {
                        buf += w.toString(16) + ",";
                    }
                } // for wx
            } // for lx

            // Now trim any trailing commas from the CSV line
            wx = buf.length-1;
            while (wx > 0 && buf.charAt(wx) == ",") {
                --wx;
            }

            // Append the resulting CSV line for the block to the unload window
            tape.appendChild(doc.createTextNode(buf.substring(0, wx+1) + "\n"));
        } // for x

        mt.setTapeUnloaded();
    }

    function unloadSetup() {
        /* Loads a status message into the "paper" rendering area, then calls
        unloadDriver after a short wait to allow the message to appear */

        win.document.getElementById("Paper").appendChild(
                win.document.createTextNode("Rendering tape image... please wait..."));
        setTimeout(unloadDriver, 50);
    }

    // Outer block of unloadTape
    win.moveTo((screen.availWidth-win.outerWidth)/2, (screen.availHeight-win.outerHeight)/2);
    win.focus();
    win.addEventListener("load", unloadSetup, false);
};

/**************************************/
D205MagTapeDrive.prototype.tapeRewind = function tapeRewind() {
    /* Rewinds the tape. Makes the drive not-ready and delays for an appropriate
    amount of time depending on how far up-tape we are. If this.rewindReady is
    true and the unit is in remote, then readies the unit again when the rewind
    is complete */
    var lastStamp;

    function rewindFinish() {
        this.timer = 0;
        this.busy = false;
        this.tapeState = this.tapeLocal;
        D205Util.removeClass(this.$$("MTRewindingLight"), "annunciatorLit");
        D205Util.addClass(this.$$("MTBlockNrLight"), "annunciatorLit");
        this.setTapeReady(this.rewindReady);
    }

    function rewindDelay() {
        var inches;
        var stamp = performance.now();
        var interval = stamp - lastStamp;

        if (interval <= 0) {
            interval = this.spinUpdateInterval/2;
        }
        if (this.tapeInches <= 0) {
            this.setAtBOT(true);
            this.timer = setCallback(this.mnemonic, this, 1000, rewindFinish);
        } else {
            inches = interval*this.rewindSpeed;
            lastStamp = stamp;
            this.timer = setCallback(this.mnemonic, this, this.spinUpdateInterval, rewindDelay);
            this.spinReel(-inches);
        }
    }

    function rewindStart() {
        this.designatedLamp.set(0);
        lastStamp = performance.now();
        this.timer = setCallback(this.mnemonic, this, this.spinUpdateInterval, rewindDelay);
    }

    if (this.timer) {
        clearCallback(this.timer);
        this.timer = 0;
    }
    if (this.tapeState != this.tapeUnloaded &&
            this.tapeState != this.tapeRewinding && !this.atBOT) {
        this.busy = true;
        this.tapeState = this.tapeRewinding;
        this.setTapeReady(false);
        this.setAtEOT(false);
        D205Util.removeClass(this.$$("MTBlockNrLight"), "annunciatorLit");
        D205Util.addClass(this.$$("MTRewindingLight"), "annunciatorLit");
        this.timer = setCallback(this.mnemonic, this, 1000, rewindStart);
    }
};

/**************************************/
D205MagTapeDrive.prototype.LoadBtn_onclick = function LoadBtn_onclick(ev) {
    /* Handle the click event for the LOAD button */

    if (!this.busy && !this.remote && this.tapeState == this.tapeUnloaded) {
        this.loadTape();
    }
};

/**************************************/
D205MagTapeDrive.prototype.UnloadBtn_onclick = function UnloadBtn_onclick(ev) {
    /* Handle the click event for the UNLOAD button */

    if (!this.busy && this.atBOT && this.tapeState == this.tapeLocal) {
        if (this.imgWritten && this.window.confirm(
                "Do you want to save the tape image data?\n(CANCEL discards the image)")) {
            this.unloadTape();          // it will do setTapeUnloaded() afterwards
        } else {
            this.setTapeUnloaded();
        }
    }
};

/**************************************/
D205MagTapeDrive.prototype.RewindBtn_onclick = function RewindBtn_onclick(ev) {
    /* Handle the click event for the REWIND button */

    if (!this.busy && !this.remote && this.tapeState != this.tapeUnloaded) {
        this.tapeRewind();
    }
};

/**************************************/
D205MagTapeDrive.prototype.RemoteSwitch_onclick = function RemoteSwitch_onclick(ev) {
    /* Handle the click event for the REMOTE button */

    this.remoteSwitch.flip();
    this.remote = (this.remoteSwitch.state != 0);
    this.setTapeReady(this.remote);
};

/**************************************/
D205MagTapeDrive.prototype.UnitDesignate_onchange = function UnitDesignate_onchange(ev) {
    /* Handle the change event for the UNIT DESIGNATE select list */
    var sx = ev.target.selectedIndex;

    if (sx >= 0) {
        if (sx < 9) {
            this.unitDesignate = sx+1;  // units 1-9
        } else {
            this.unitDesignate = 0;     // unit 10
        }
    }
};

/**************************************/
D205MagTapeDrive.prototype.RewindReadySwitch_onclick = function RewindReadySwitch_onclick(ev) {
    /* Handle the click event for the LOCAL button */

    this.rewindReadySwitch.flip();
    this.rewindReady = (this.rewindReadySwitch.state != 0);
};

/**************************************/
D205MagTapeDrive.prototype.NotWriteSwitch_onclick = function NotWriteSwitch_onclick(ev) {
    /* Handle the click event for the WRITE RING button */

    this.notWriteSwitch.flip();
    this.notWrite = (this.notWriteSwitch.state != 0);
    this.notWriteLamp.set(this.notWrite ? 1 : 0);
};

/**************************************/
D205MagTapeDrive.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205MagTapeDrive.prototype.tapeDriveOnload = function tapeDriveOnload() {
    /* Initializes the reader window and user interface */
    var body;

    this.doc = this.window.document;
    this.doc.title = "retro-205 Tape Drive " + this.mnemonic;

    body = this.$$("MTDiv");
    this.reelBar = this.$$("MTReelBar");
    this.reelIcon = this.$$("MTReel");
    this.unitDesignateList = this.$$("UnitDesignate");
    this.unitDesignateList.selectedIndex = (this.unitIndex < 1 ? 9 : this.unitIndex)-1;

    this.designatedLamp = new ColoredLamp(body, null, null, "DesignatedLamp", "orangeLamp", "orangeLit");
    this.notReadyLamp = new ColoredLamp(body, null, null, "NotReadyLamp", "orangeLamp", "orangeLit");
    this.notWriteLamp = new ColoredLamp(body, null, null, "NotWriteLamp", "orangeLamp", "orangeLit");

    this.remoteSwitch = new ToggleSwitch(body, null, null, "RemoteSwitch",
            D205ControlConsole.offSwitchClass, D205ControlConsole.onSwitchClass);
    this.remoteSwitch.set(this.remote);

    this.rewindReadySwitch = new ToggleSwitch(body, null, null, "RewindReadySwitch",
            D205ControlConsole.offSwitchClass, D205ControlConsole.onSwitchClass);
    this.rewindReadySwitch.set(this.rewindReady);

    this.notWriteSwitch = new ToggleSwitch(body, null, null, "NotWriteSwitch",
            D205ControlConsole.offSwitchClass, D205ControlConsole.onSwitchClass);
    this.notWriteSwitch.set(this.notWrite);


    this.tapeState = this.tapeLocal;    // setTapeUnloaded() requires it to be in local
    this.atBOT = true;                  // and also at BOT
    this.setTapeUnloaded();

    this.window.addEventListener("beforeunload",
            D205MagTapeDrive.prototype.beforeUnload, false);
    this.$$("UnloadBtn").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.UnloadBtn_onclick), false);
    this.$$("LoadBtn").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.LoadBtn_onclick), false);
    this.$$("RemoteSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.RemoteSwitch_onclick), false);
    this.$$("RewindReadySwitch").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.RewindReadySwitch_onclick), false);
    this.$$("NotWriteSwitch").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.NotWriteSwitch_onclick), false);
    this.$$("RewindBtn").addEventListener("click",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.RewindBtn_onclick), false);
    this.unitDesignateList.addEventListener("change",
            D205Util.bindMethod(this, D205MagTapeDrive.prototype.UnitDesignate_onchange), false);
};

/**************************************/
D205MagTapeDrive.prototype.readBlock = function readBlock(receiveBlock) {
    /* Reads the next block from the tape. If at EOT, makes the drive not ready
    and terminates the read. After delaying for tape motion, calls the receiveBlock
    callback function to pass the block to the control unit and thence the processor */
    var wx = this.blockNr*this.blockWords;

    if (this.blockNr >= this.imgMaxBlocks) {
        this.setTapeReady(false);
        this.setAtEOT(true);
        this.designatedLamp.set(0);
        this.busy = false;
        receiveBlock(null, true);       // terminate the I/O
    } else {
        if (this.atBOT) {
            this.setAtBOT(false);
        }
        this.moveTape(this.blockLength, this.blockLength/this.tapeSpeed, function readBlockComplete() {
            ++this.blockNr;
            this.showBlockNr();
            receiveBlock(this.image[this.laneNr].subarray(wx, wx+this.blockWords), false);
        });
    }
};

/**************************************/
D205MagTapeDrive.prototype.readTerminate = function readTerminate() {
    /* Terminates a read operation on the tape drive and makes it not-busy */

    this.designatedLamp.set(0);
    this.busy = false;
};

/**************************************/
D205MagTapeDrive.prototype.readInitiate = function readInitiate(receiveBlock) {
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
D205MagTapeDrive.prototype.writeBlock = function writeBlock(block, sendBlock, lastBlock) {
    /* Writes the next block from the tape. If at EOT, makes the drive not ready
    and terminates the write. Calls the receiveBlock callback function to pass the
    block to the processor */
    var lane = this.image[this.laneNr];
    var wx = this.blockNr*this.blockWords;
    var x;

    if (this.blockNr >= this.imgMaxBlocks) {
        this.setTapeReady(false);
        this.setAtEOT(true);
        this.designatedLamp.set(0);
        this.busy = false;
        sendBlock(true);                // terminate the I/O
    } else {
        if (this.atBOT) {
            this.setAtBOT(false);
        }

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
D205MagTapeDrive.prototype.writeInitiate = function writeInitiate(sendBlock, lastBlock) {
    /* Initiates a write operation on the unit. Delays for the start-up time of the drive
    and calls writeBlock() to retrieve data from the Processor and write it to tape */

    setCallback(this.mnemonic, this, this.startupTime, sendBlock, false);
};

/**************************************/
D205MagTapeDrive.prototype.writeReadyTest = function writeReadyTest() {
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
D205MagTapeDrive.prototype.search = function search(laneNr, targetBlock, complete, lampSet, testDisabled) {
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
        if (this.blockNr == 0) {
            this.setAtBOT(true);
        } else if (this.blockNr > this.imgMaxBlocks) {
            this.setTapeReady(false);
            this.setAtEOT(true);
        }
        complete(this.blockNr == targetBlock);
    }

    function searchBackward() {
        /* While the tape is beyond the target block, moves backward one block and
        is called by moveTape to evaluate the new block position */

        --this.blockNr;
        this.showBlockNr();
        if (this.atEOT) {
            this.setAtEOT(false);
        }

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
        if (this.atBOT) {
            this.setAtBOT(false);
        }

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
D205MagTapeDrive.prototype.rewind = function rewind() {
    /* Initiates a rewind operation on the unit. If the drive is busy or not ready,
    returns true.  Otherwise, makes the drive not-ready, delays for an
    appropriate amount of time depending on how far up-tape we are, then readies the
    unit again */
    var result = false;

    if (this.busy) {
        result = true;                  // report unit busy
    } else if (!this.ready) {
        result = true;                  // report unit not ready
    } else {
        this.designatedLamp.set(1);
        this.tapeRewind();
    }
    //console.log(this.mnemonic + " rewind:           result=" + result.toString());
    return result;
};

/**************************************/
D205MagTapeDrive.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.timer) {
        clearCallback(this.timer);
    }
    this.window.removeEventListener("beforeunload", D205MagTapeDrive.prototype.beforeUnload, false);
    this.window.close();
    if (this.loadWindow && !this.loadWindow.closed) {
        this.loadWindow.close();
    }
};
