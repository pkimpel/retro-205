/***********************************************************************
* retro-205/emulator D205CardatronInput.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* Datatron 205 Cardatron Input Unit module.
*
* Defines a card reader peripheral unit type.
*
************************************************************************
* 2015-01-31  P.Kimpel
*   Original version, from retro-b5500 B5500CardReader.js.
***********************************************************************/
"use strict";

/**************************************/
function D205CardatronInput(mnemonic, unitIndex) {
    /* Constructor for the Cardatron Input object */
    var left = 0;                       // (temporary window x-offset)
    var x;

    this.mnemonic = mnemonic;           // Unit mnemonic
    this.unitIndex = unitIndex;         // Ready-mask bit number

    this.timer = 0;                     // setCallback() token
    this.boundFinishCardRead = D205Util.bindMethod(this, D205CardatronInput.prototype.finishCardRead);

    this.clear();

    this.window = window.open("", mnemonic);
    if (this.window) {
        this.shutDown();                // destroy the previously-existing window
        this.window = null;
    }
    this.doc = null;
    this.window = window.open("../webUI/D205CardatronInput.html", mnemonic,
            "location=no,scrollbars=no,resizable,width=560,height=160,left=0,top=" + left);
    this.window.addEventListener("load",
            D205Util.bindMethod(this, D205CardatronInput.prototype.readerOnload), false);

    this.hopperBar = null;
    this.outHopperFrame = null;
    this.outHopper = null;
    this.formatColumn = null;
    this.formatSelect = null;

    // Buffer drum: information band is [0], format bands are [1]-[6]
    this.bufferDrum = new ArrayBuffer(315*7);
    this.info = new Uint8Array(this.bufferDrum, 0, 315);        // information band
    this.formatBand = [
            null,                                               // no format band 0
            new Uint8Array(this.bufferDrum, 315*1, 315),        // format band 1
            new Uint8Array(this.bufferDrum, 315*2, 315),        // format band 2
            new Uint8Array(this.bufferDrum, 315*3, 315),        // format band 3
            new Uint8Array(this.bufferDrum, 315*4, 315),        // format band 4
            new Uint8Array(this.bufferDrum, 315*5, 315),        // format band 5
            new Uint8Array(this.bufferDrum, 315*6, 315)];       // format band 6 (fixed)

    // Initialize format band 6 for all-numeric transfer
    // (note that ArrayBuffer storage is initialized to zero, so [160..315]=0)
    for (x=0; x<160; x+=2) {
        this.formatBand[x] = 3;
        this.formatBand[x+1] = 1;
    }
}

D205CardatronInput.prototype.eolRex = /([^\n\r\f]*)((:?\r[\n\f]?)|\n|\f)?/g;

D205CardatronInput.prototype.cardsPerMinute = 480;         // IBM Type 087 collator

// Filter ASCII character values to buffer drum info band digits.
// See U.S. Patent 3,000,556, September 16, 1961, Figure 2, Brewley & Foster.
D205CardatronInput.prototype.cardFilter = [
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,  // 00-0F
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,  // 10-1F
        0x00,0x60,0x00,0x0B,0x2B,0x4C,0x10,0x00,0x00,0x00,0x2C,0x50,0x4B,0x20,0x1B,0x41,  // 20-2F
        0x40,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x00,0x00,0x1C,0x00,0x00,0x00,  // 30-3F
        0x0C,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x21,0x22,0x23,0x24,0x25,0x26,  // 40-4F
        0x27,0x28,0x29,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x00,0x00,0x00,0x00,0x00,  // 50-5F
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,  // 60-6F
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]; // 70-7F

// Translate buffer zone digits to internal zone decades.
// Each row is indexed by the zone digit from the buffer drum info band;
// each column is indexed by the PREVIOUS numeric digit from the info band.
// See U.S. Patent 3,000,556, September 16, 1961, Figure 9, Brewley & Foster.
D205CardatronInput.prototype.zoneXlate = [
        [0, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0, 3, 3],        // zone digit 0
        [1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0],        // zone digit 1
        [2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 1, 1],        // zone digit 2
        null,                                           // there no 3 zone digits
        [8, 2, 6, 6, 6, 6, 6, 6, 6, 6, 0, 2, 2],        // zone digit 4
        [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],        // zone digit 5
        [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];       // zone digit 6


/**************************************/
D205CardatronInput.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the reader unit state */

    this.ready = false;                 // ready status
    this.bufferReady = false;           // buffer drum info band is ready to read
    this.noFormatAlarm = false;         // No Formal Alarm toggle
    this.reloadLockout = false;         // Reload Lockout toggle
    this.formatLockout = false;         // Format Lockout toggle

    this.buffer = "";                   // Card reader "input hopper"
    this.bufLength = 0;                 // Current input buffer length (characters)
    this.bufIndex = 0;                  // 0-relative offset to next "card" to be read
};

/**************************************/
D205CardatronInput.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205CardatronInput.prototype.setReaderReady = function setReaderReady(ready) {
    /* Controls the ready-state of the card reader */

    this.$$("CRFileSelector").disabled = ready;
    this.ready = ready;
    if (ready) {
        D205Util.addClass(this.$$("CRStartBtn"), "greenLit")
        D205Util.removeClass(this.$$("CRStopBtn"), "redLit");
    } else {
        D205Util.removeClass(this.$$("CRStartBtn"), "greenLit")
        D205Util.addClass(this.$$("CRStopBtn"), "redLit");
    }
};

/**************************************/
D205CardatronInput.prototype.setNoFormatAlarm = function setNoFormatAlarm(noFormat) {
    /* Controls the state of the No Format alarm and lamp */

    this.noFormatAlarm = noFormat;
    if (noFormat) {
        this.setReaderReady(false);
        this.noFormatLamp.set(1);
    } else {
        this.noFormatLamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.setReloadLockout = function setReloadLockout(lockout) {
    /* Controls the state of the Reload Lockout (RLO) toggle and lamp */

    this.reloadLockout = lockout;
    if (lockout) {
        this.reloadLockoutLamp.set(1);
    } else {
        this.reloadLockoutLamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.setFormatLockout = function setFormatLockout(lockout) {
    /* Controls the state of the Format Lockout (FLO) toggle and lamp.
    Setting Format Lockout implicitly sets Reload Lockout */

    this.formatLockout = lockout;
    if (lockout) {
        this.setReloadLockout(true);
        this.formatLockoutLamp.set(1);
    } else {
        this.formatLockoutLamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.CRStartBtn_onClick = function CRStartBtn_onClick(ev) {
    /* Handle the click event for the START button */

    if (!this.ready) {
        if (this.bufIndex < this.bufLength) {
            this.setReaderReady(true);
            if (!this.bufferReady) {
                this.initiateCardRead();
            }
        }
    }
};

/**************************************/
D205CardatronInput.prototype.CRStopBtn_onClick = function CRStopBtn_onClick(ev) {
    /* Handle the click event for the STOP button */

    this.$$("CRFileSelector").value = null;     // reset the control so the same file can be reloaded
    if (this.ready) {
        this.setReaderReady(false);
        this.setNoFormatAlarm(false);
        this.startMachineLamp.set(0);
        this.formatSelect1Lamp.set(0);
        this.formatSelect2Lamp.set(0);
        this.formatSelect4Lamp.set(0);
    }
};

/**************************************/
D205CardatronInput.prototype.ClearBtn_onClick = function ClearBtn_onClick(ev) {
    /* Handle the click event for the CLEAR button */

    this.$$("CRFileSelector").value = null;     // reset the control so the same file can be reloaded
    this.bufferReady = false;
    this.setReaderReady(false);
    this.setNoFormatAlarm(false);
    this.setReloadLockout(0);
    this.setFormatLockout(0);
    this.startMachineLamp.set(0);
    this.formatSelect1Lamp.set(0);
    this.formatSelect2Lamp.set(0);
    this.formatSelect4Lamp.set(0);
    this.formatSelect.selectedIndex = 0;
    this.formatColumn.selectedIndex = 0;
};

/**************************************/
D205CardatronInput.prototype.CRHopperBar_onClick = function CRHopperBar_onClick(ev) {
    /* Handle the click event for the "input hopper" meter bar */

    if (this.bufIndex < this.bufLength && !this.ready) {
        if (this.window.confirm((this.bufLength-this.bufIndex).toString() + " of " + this.bufLength.toString() +
                     " characters remaining to read.\nDo you want to clear the input hopper?")) {
            this.buffer = "";
            this.bufLength = 0;
            this.bufIndex = 0;
            this.hopperBar.value = 0;
            this.$$("CRFileSelector").value = null;     // reset the control
            while (this.outHopper.childNodes.length > 0) {
                this.outHopper.removeChild(this.outHopper.firstChild);
            }
        }
    }
};

/**************************************/
D205CardatronInput.prototype.fileSelector_onChange = function fileSelector_onChange(ev) {
    /* Handle the <input type=file> onchange event when files are selected. For each
    file, load it and add it to the "input hopper" of the reader */
    var deck;
    var f = ev.target.files;
    var that = this;
    var x;

    function fileLoader_onLoad(ev) {
        /* Handle the onload event for a Text FileReader */

        if (that.bufIndex >= that.bufLength) {
            that.buffer = ev.target.result;
        } else {
            switch (that.buffer.charAt(that.buffer.length-1)) {
            case "\r":
            case "\n":
            case "\f":
                break;                  // do nothing -- the last card has a delimiter
            default:
                that.buffer += "\n";    // so the next deck starts on a new line
                break;
            }
            that.buffer = that.buffer.substring(that.bufIndex) + ev.target.result;
        }

        that.bufIndex = 0;
        that.bufLength = that.buffer.length;
        that.$$("CRHopperBar").value = that.bufLength;
        that.$$("CRHopperBar").max = that.bufLength;
    }

    for (x=f.length-1; x>=0; x--) {
        deck = new FileReader();
        deck.onload = fileLoader_onLoad;
        deck.readAsText(f[x]);
    }
};

/**************************************/
D205CardatronInput.prototype.readCardImage = function readCardImage() {
    /* Reads one card image from the buffer; pads or trims the image as necessary
    to 80 characters. Detects empty buffer (hopper) and sets the reader not ready
    after reading the last card. Updates the progress bar. Returns the raw ASCII
    card image as a string */
    var card;                           // card image
    var cardLength;                     // length of card image
    var match;                          // result of eolRex.exec()

    this.eolRex.lastIndex = this.bufIndex;
    match = this.eolRex.exec(this.buffer);
    if (!match) {
        card = "";
        cardLength = 0;
    } else {
        this.bufIndex += match[0].length;
        card = match[1].toUpperCase();
        cardLength = card.length;
        if (cardLength > 80) {
            cardLength = 80;
        }
    }

    while (cardLength <= 70) {
        card += "          ";           // pad with spaces
        cardLength+= 10;
    }
    while (cardLength < 80) {
        card += " ";
        ++cardLength;
    }

    if (this.bufIndex < this.bufLength) {
        this.hopperBar.value = this.bufLength-this.bufIndex;
    } else {
        this.hopperBar.value = 0;
        this.buffer = "";               // discard the input buffer
        this.bufLength = 0;
        this.bufIndex = 0;
        this.setReaderReady(false);
        this.$$("CRFileSelector").value = null; // reset the control so the same file can be reloaded
    }

    while (this.outHopper.childNodes.length > 1) {
        this.outHopper.removeChild(this.outHopper.firstChild);
    }
    this.outHopper.appendChild(this.doc.createTextNode("\n"));
    this.outHopper.appendChild(this.doc.createTextNode(card));

    return card;
};

/**************************************/
D205CardatronInput.prototype.determineFormatBand = function determineFormatBand(card) {
    /* Determines the format band number to be applied to the current card.
    Returns the format band number or zero if No Format Alarm is set */
    var c;                              // selected column character code
    var format;                         // selected format band
    var x;                              // character/column index

    // Check for format override on the reader panel
    format = this.formatSelect.selectedIndex;
    if (format > 6) {
        format = 0;
        this.setNoFormatAlarm(true);
    } else if (format <= 0) {
        // No format override, so determine format from a card column
        x = this.formatColumn.selectedIndex;
        if (x <= 0) {
            x = 0;                      // column 1
        } else if (x == 1) {
            x = card.length-1;          // column 80
        } else if (x < card.length) {
            --x;                        // columns 2-79
        } else {
            x = 0;                      // treat everything else as col 1
        }

        c = card.charAt(x);
        switch (c) {
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
            format = parseInt(c);
            break;
        case "`":                       // 1-8 punch
            format = 1;
            this.setFormatLockout(true);
            break;
        case ":":                       // 2-8 punch
            format = 2;
            this.setFormatLockout(true);
            break;
        case "#":                       // 3-8 punch
            format = 3;
            this.setFormatLockout(true);
            break;
        case "@":                       // 4-8 punch
            format = 4;
            this.setFormatLockout(true);
            break;
        case "'":                       // 5-8 punch
            format = 5;
            this.setFormatLockout(true);
            break;
        case "=":                       // 6-8 punch
            format = 6;
            this.setFormatLockout(true);
            break;
        case '"':                       // 7-8 punch
            format = 7;
            this.setFormatLockout(true);
            break;
        default:
            format = 0;
            this.setNoFormatAlarm(true);
            break;
        } // switch c
    }

    // Set the FS lamps on the reader panel
    this.formatSelect1Lamp.set(format & 0x01);
    this.formatSelect2Lamp.set((format >>> 1) & 0x01);
    this.formatSelect4Lamp.set((format >>> 2) & 0x01);

    return format;
};

/**************************************/
D205CardatronInput.prototype.finishCardRead = function finishCardRead() {
    /* Processes a card image after the delay to read the card. Establishes the
    format band to be used and encodes the data from the card image onto the
    info band of the buffer drum per Figure 2 in US Patent 3,000,556 */
    var band;                           // local copy of selected format band
    var c;                              // current character code
    var card = this.readCardImage();    // the card image in ASCII
    var col;                            // current card column
    var format;                         // selected format band
    var fmax;                           // length of format band
    var info = this.info;               // local copy of info band on buffer drum
    var nu;                             // numeric (1), zone (0) toggle
    var x;                              // info/format band digit index

    this.startMachineLamp.set(0);
    format = this.determineFormatBand(card);
    if (format == 7) {
        // Reject format -- clear the information band and read next card
        for (x=info.length-1; x>=0; --x) {
            info[x] = 0;
        }
        if (!this.reloadLockout) {
            this.initiateCardRead();
        }
    } else if (format > 0) {
        band = this.formatBand[format];
        fmax = band.length;
        col = card.length-1;            // start with last column on card
        nu = 0;                         // start with the zone digit

        for (x=0; x<fmax; ++x) {
            if (band[x] == 0) {
                info[x] = 0;
            } else {
                if (nu) {
                    info[x] = c & 0x0F;         // take the numeric half
                    nu = 0;                     // next will be the zone digit
                    if (col > 0) {
                        --col;                  // done with this card column
                    }
                } else {
                    c = card.charCodeAt(col);
                    if (c < 0x80) {
                        c = this.cardFilter[c];
                    } else if (c == 0xA4) {     // the "lozenge" - "¤"
                        c = this.cardFilter[0x3C];  // use the code for "<"
                    } else {
                        c = 0;
                    }
                    info[x] = (c >>> 4) & 0x0F; // take the zone half
                    nu = 1;                     // next will be the numeric digit
                }
            }
        } // for x

        this.bufferReady = true;
    }
};

/**************************************/
D205CardatronInput.prototype.initiateCardRead = function initiateCardRead() {
    /* Initiates the read of the next card into the buffer drum */

    if (this.ready) {
        this.startMachineLamp.set(1);
        this.timer = setCallback(this.mnemonic, this,
            60000/this.cardsPerMinute, this.boundFinishCardRead);
    }
};

/**************************************/
D205CardatronInput.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205CardatronInput.prototype.readerOnload = function readerOnload() {
    /* Initializes the reader window and user interface */
    var body;
    var de;

    this.doc = this.window.document;
    de = this.doc.documentElement;
    this.doc.title = "retro-205 Cardatron Input " + this.mnemonic;

    body = this.$$("CRDiv");
    this.hopperBar = this.$$("CRHopperBar");
    this.outHopperFrame = this.$$("CROutHopperFrame");
    this.outHopper = this.outHopperFrame.contentDocument.getElementById("Paper");
    this.formatColumn = this.$$("FormatColumn");
    this.formatSelect = this.$$("FormatSelect");

    this.noFormatLamp = new ColoredLamp(body, null, null, "NoFormatLamp", "redLamp", "redLit");
    this.noFormatLamp.setCaption("NO FORMAT", true);

    this.startMachineLamp = new NeonLamp(body, null, null, "StartMachineLamp");
    this.startMachineLamp.setCaption("SM", true);
    this.reloadLockoutLamp = new NeonLamp(body, null, null, "ReloadLockoutLamp");
    this.reloadLockoutLamp.setCaption("RLO", true);
    this.formatLockoutLamp = new NeonLamp(body, null, null, "FormatLockoutLamp");
    this.formatLockoutLamp.setCaption("FLO", true);

    this.formatSelect1Lamp = new NeonLamp(body, null, null, "FormatSelect1Lamp");
    this.formatSelect1Lamp.setCaption("FS1", true);
    this.formatSelect2Lamp = new NeonLamp(body, null, null, "FormatSelect2Lamp");
    this.formatSelect2Lamp.setCaption("FS2", true);
    this.formatSelect4Lamp = new NeonLamp(body, null, null, "FormatSelect4Lamp");
    this.formatSelect4Lamp.setCaption("FS4", true);

    this.setReaderReady(false);

    this.window.addEventListener("beforeunload",
            D205CardatronInput.prototype.beforeUnload);
    this.$$("CRFileSelector").addEventListener("change",
            D205Util.bindMethod(this, D205CardatronInput.prototype.fileSelector_onChange));
    this.$$("CRStartBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronInput.prototype.CRStartBtn_onClick));
    this.$$("CRStopBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronInput.prototype.CRStopBtn_onClick));
    this.$$("ClearBtn").addEventListener("click",
            D205Util.bindMethod(this, D205CardatronInput.prototype.ClearBtn_onClick));
    this.hopperBar.addEventListener("click",
            D205Util.bindMethod(this, D205CardatronInput.prototype.CRHopperBar_onClick));

    this.window.resizeBy(de.scrollWidth - this.window.innerWidth + 4, // kludge for right-padding/margin
                         de.scrollHeight - this.window.innerHeight);
};

/**************************************/
D205CardatronInput.prototype.read = function read(kDigit) {
    /* Initiates a read operation on the unit. If the reader is not ready,
    returns Not Ready */
    var card;

    this.errorMask = 0;
    if (!this.ready) {
        finish(0x04, 0);                // report unit not ready
    } else {
        this.busy = true;
        card = this.readCardAlpha(buffer, length);

        this.timer = setCallback(this.mnemonic, this,
            60000/this.cardsPerMinute, function readDelay() {
                this.busy = false;
                finish(this.errorMask, length);
        });

        if (this.bufIndex < this.bufLength) {
            this.hopperBar.value = this.bufLength-this.bufIndex;
        } else {
            this.hopperBar.value = 0;
            this.buffer = "";           // discard the input buffer
            this.bufLength = 0;
            this.bufIndex = 0;
            this.setReaderReady(false);
            this.$$("CRFileSelector").value = null; // reset the control so the same file can be reloaded
        }

        while (this.outHopper.childNodes.length > 1) {
            this.outHopper.removeChild(this.outHopper.firstChild);
        }
        this.outHopper.appendChild(this.doc.createTextNode("\n"));
        this.outHopper.appendChild(this.doc.createTextNode(card));
    }
};

/**************************************/
D205CardatronInput.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.timer) {
        clearCallback(this.timer);
    }
    this.window.removeEventListener("beforeunload", D205CardatronInput.prototype.beforeUnload);
    this.window.close();
};
