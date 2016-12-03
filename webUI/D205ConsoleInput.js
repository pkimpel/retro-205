/***********************************************************************
* retro-205/emulator D205ConsoleInput.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData Datatron Console Input module.
*
* Defines the paper tape and keyboard input devices.
*
************************************************************************
* 2014-12-31  P.Kimpel
*   Original version, from B5500CardReader.js.
***********************************************************************/
"use strict";

/**************************************/
function D205ConsoleInput(mnemonic, p) {
    /* Constructor for the ConsoleInput object */

    this.hasPaperTapeReader = p.config.getNode("ControlConsole.hasPaperTapeReader");
    this.inTimer = 0;                   // setCallback() token
    this.mnemonic = mnemonic;           // Unit mnemonic
    this.readerPeriod = D205ConsoleInput.opticalPeriod;
                                        // paper-tape reader speed [ms/char]

    this.clear();

    if (!this.hasPaperTapeReader) {
        this.readTapeDigit = this.dummyReadTapeDigit;
    } else {
        this.readTapeDigit = this.actualReadTapeDigit;
        this.doc = null;
        this.tapeSupplyBar = null;
        this.tapeView = null;
        this.window = window.open("../webUI/D205PaperTapeReader.html", mnemonic,
                "location=no,scrollbars=no,resizable,width=370,height=100,left=300,top=430");
        this.window.addEventListener("load",
                D205Processor.bindMethod(this, D205ConsoleInput.prototype.readerOnload), false);
        }
}

/**************************************/
D205ConsoleInput.mechanicalPeriod = 1000/10; // mechanical reader speed: 10 cps;
D205ConsoleInput.opticalPeriod = 1000/540;   // optical reader speed: 540 cps;

/**************************************/
D205ConsoleInput.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the reader unit state */

    this.ready = false;                 // a tape has been loaded into the reader
    this.busy = false;                  // a request for a digit is outstanding
    this.pendingReceiver = null;        // stashed digit-receiver function
    this.pendingInputUnit = 0;          // stashed input unit number

    this.buffer = "";                   // reader input buffer (paper-tape reel)
    this.bufLength = 0;                 // current input buffer length (characters)
    this.bufIndex = 0;                  // 0-relative offset to next character to be read
};

/**************************************/
D205ConsoleInput.prototype.$$ = function $$(e) {
    return this.doc.getElementById(e);
};

/**************************************/
D205ConsoleInput.prototype.PRTapeSupplyBar_onclick = function PRTapeSupplyBar_onclick(ev) {
    /* Handle the click event for the "input hopper" meter bar */

    if (this.ready) {
        if (this.window.confirm((this.bufLength-this.bufIndex).toString() + " of " + this.bufLength.toString() +
                     " characters remaining to read.\nDo you want to clear the reader input?")) {
            this.ready = false;
            this.buffer = "";
            this.bufLength = 0;
            this.bufIndex = 0;
            this.tapeSupplyBar.value = 0;
            this.tapeView.value = "";
            this.$$("PRFileSelector").value = null;     // reset the control
        }
    }
};

/**************************************/
D205ConsoleInput.prototype.fileSelector_onChange = function fileSelector_onChange(ev) {
    /* Handle the <input type=file> onchange event when files are selected. For each
    file, load it and add it to the input buffer of the reader */
    var tape;
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
                break;                  // do nothing -- the last word has a delimiter
            default:
                that.buffer += "\n";    // so the next tape starts on a new line
                break;
            }
            that.buffer = that.buffer.substring(that.bufIndex) + ev.target.result;
        }

        that.bufIndex = 0;
        that.bufLength = that.buffer.length;
        that.$$("PRTapeSupplyBar").value = that.bufLength;
        that.$$("PRTapeSupplyBar").max = that.bufLength;
        that.ready = true;
        if (that.busy) {                // reinitiate the pending read
            that.readTapeDigit(that.pendingInputUnit, that.pendingReceiver);
            that.receiver = null;
        }
    }

    for (x=f.length-1; x>=0; x--) {
        tape = new FileReader();
        tape.onload = fileLoader_onLoad;
        tape.readAsText(f[x]);
    }
};

/**************************************/
D205ConsoleInput.prototype.beforeUnload = function beforeUnload(ev) {
    var msg = "Closing this window will make the device unusable.\n" +
              "Suggest you stay on the page and minimize this window instead";

    ev.preventDefault();
    ev.returnValue = msg;
    return msg;
};

/**************************************/
D205ConsoleInput.prototype.readerOnload = function readerOnload() {
    /* Initializes the reader window and user interface */
    var de;

    this.doc = this.window.document;
    de = this.doc.documentElement;
    this.doc.title = "retro-205 - Paper Tape Reader ";

    this.tapeSupplyBar = this.$$("PRTapeSupplyBar");
    this.tapeView = this.$$("PRTapeView");

    this.window.addEventListener("beforeunload",
            D205ConsoleInput.prototype.beforeUnload, false);
    this.$$("PRFileSelector").addEventListener("change",
            D205Processor.bindMethod(this, D205ConsoleInput.prototype.fileSelector_onChange));
    this.tapeSupplyBar.addEventListener("click",
            D205Processor.bindMethod(this, D205ConsoleInput.prototype.PRTapeSupplyBar_onclick));

    this.window.resizeBy(de.scrollWidth - this.window.innerWidth + 4, // kludge for right-padding/margin
                         de.scrollHeight - this.window.innerHeight);
};

/**************************************/
D205ConsoleInput.prototype.sendTapeDigit = function sendTapeDigit(digit, receiver) {
    /* Sends the digit or finish pulse read from the tape back to the Processor
    after an appropriate delay. Updates the TapeView display with the digit/pulse
    sent */
    var char = (digit < 0 ? " " : digit.toString());
    var length;
    var text = this.tapeView.value;

    this.inTimer = setCallback(this.mnemonic, this, this.readerPeriod, receiver, digit);
    length = text.length;
    if (length < 120) {
        this.tapeView.value = text + char;
        ++length;
    } else {
        this.tapeView.value = text.substring(length-119) + char;
    }
    this.tapeView.setSelectionRange(length-1, length);
};

/**************************************/
D205ConsoleInput.prototype.setReaderEmpty = function setReaderEmpty() {
    /* Sets the reader to a not-ready status and empties the buffer */

    this.ready = false;
    this.tapeSupplyBar.value = 0;
    this.buffer = "";                   // discard the input buffer
    this.bufLength = 0;
    this.bufIndex = 0;
    this.$$("PRFileSelector").value = null; // reset the control so the same file can be reloaded
};

/**************************************/
D205ConsoleInput.prototype.readTapeDigit = null;
    /* Will be set to actualReadTapeDigit or dummyReadTapeDigit by constructor */

/**************************************/
D205ConsoleInput.prototype.dummyReadTapeDigit = function dummyReadTapeDigit(inputUnit, receiver) {
    /* Stub paper-tape reader routine used when the system configuration does not
    include the paper-tape reader devices. It simply does nothing, which will cause
    the Processor to hang on the missing device, waiting for a digit to be sent */

    return;
};

/**************************************/
D205ConsoleInput.prototype.actualReadTapeDigit = function actualReadTapeDigit(inputUnit, receiver) {
    /* Reads one digit image from the paper-tape buffer and passes it to the
    "receiver" function. If at end-of-line, passes a finish indication to the
    receiver. A finish pulse is indicated by a negative digit value; a digit
    (clock) pulse is indicated by a non-negative value.
    If the buffer is empty (this.ready=false) or we are at end of buffer,
    simply exits after stashing a reference to the receiver function in
    this.pendingReceiver. This will leave the processor hanging until more tape
    is loaded into the reader or the processor is cleared. Once more tape is
    loaded, the fileSelector_onChange event will set ready, notice the hanging
    read (this.busy=true) and restart the read.
    The inputUnit parameter only controls the speed of the paper-tape input.
    In this implementation, there is only one physical reader */
    var bufLength = this.bufLength;     // current buffer length
    var c;                              // current character
    var x = this.bufIndex;              // current buffer index

    this.readerPeriod = (inputUnit ? D205ConsoleInput.opticalPeriod : D205ConsoleInput.mechanicalPeriod);

    if (!this.ready) {
        this.busy = true;
        this.pendingReceiver = receiver;// stash the receiver until tape is loaded
        this.pendingInputUnit = inputUnit;
        this.window.focus();            // call attention to the tape reader
    } else {
        this.busy = false;
        do {
            if (x >= bufLength) {       // end of buffer -- send finish
                this.sendTapeDigit(-1, receiver);
                this.setReaderEmpty();
                break; // out of do loop
            } else {
                c = this.buffer.charCodeAt(x);
                if (c > 0x39) {         // it's greater than "9" -- ignore
                    ++x;
                } else if (c >= 0x30) { // it's a digit -- send it with no finish
                    ++x;
                    this.sendTapeDigit(c-0x30, receiver);
                    break; // out of do loop
                } else if (c == 0x0D) { // carriage return -- send finish and check for LF
                    if (++x < bufLength && this.buffer.charCodeAt(x) == 0x0A) {
                        ++x;
                    }
                    this.sendTapeDigit(-1, receiver);
                    if (x >= bufLength) {
                        this.setReaderEmpty();
                    }
                    break; // out of do loop
                } else if (c == 0x0A) { // line feed -- send finish
                    ++x;
                    this.sendTapeDigit(-1, receiver);
                    if (x >= bufLength) {
                        this.setReaderEmpty();
                    }
                    break; // out of do loop
                } else {                // it's less than "0" -- ignore
                    ++x;
                }
            }
        } while (true);

        this.tapeSupplyBar.value = bufLength-x;
        this.bufIndex = x;
    }
};

/**************************************/
D205ConsoleInput.prototype.shutDown = function shutDown() {
    /* Shuts down the device */

    if (this.inTimer) {
        clearCallback(this.inTimer);
    }

    if (this.window) {
        this.window.removeEventListener("beforeunload", D205ConsoleInput.prototype.beforeUnload, false);
        this.window.close();
        this.window = null;
    }
};
