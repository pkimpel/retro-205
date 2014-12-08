/***********************************************************************
* retro-205/emulator D205Processor.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* Electrodata/Burroughs Datatron 205 Emulator Processor (CPU) module.
*
* Instance variables in all caps generally refer to register or flip-flop (FF)
* entities in the processor hardware. See the following documents:
*
*   Burroughs 205 Handbook (Bulletin 3021, Burroughs Corporation, 1956).
*   Programming and Coding Manual, Datatron (Bulletin 3040A, Electrodata Corporation, 1954).
*   Handbook of Operating Procedures for the Burroughs 205
*       (Bulletin 3034A, Burroughs Corporation, May 1960).
*
* available at:
*   http://bitsavers.org/pdf/burroughs/electrodata/205/
*
* also:
*
*   Engineering Description of the Electrodata Digital Computer, J. C. Alrich,
*       (IRE Transactions on Electronic Computers, vol EC-4, Number 1, March 1955).
*   TM4001 Datatron 205 Computer (Training Edition) (Burroughs Corporation, December,1956).
*
* Datatron 205 word format:
*   44 bits, encoded as binary-coded decimal (BCD); non-decimal codes are invalid
*   and cause the computer to stop.
*   High-order 4 bits are the "sign digit"
*       Low-order bit of this digit is the actual sign.
*       Higher-order bits are used in some I/O operations.
*   Remaining 40 bits are the value as:
*       10 decimal digits as a fractional mantissa, with the decimal point between
*           the sign and high-order (10th) digits
*       5 character codes
*       one instruction word
*
*   Instruction word format:
*       Low-order 4 digits: operand address
*       Next-higher 2 digits: operation code
*       Next-higher 4 digits: breakpoint and special-function codes
*       Sign digit: odd value indicates the B register is to be added to the
*           operand address prior to execution.
*
************************************************************************
* 2014-11-29  P.Kimpel
*   Original version, from thin air and a little bit of retro-B5500 code.
***********************************************************************/
"use strict";

/**************************************/
function D205Processor() {
    /* Constructor for the 205 Processor module object */

    this.scheduler = 0;                 // Current setCallback token

    this.clear();                       // Create and initialize the processor state

    // Supervisory Panel switches
    this.sswLockNormal = 0;             // Lock/Normal switch
    this.sswContStep = 0;               // Continuous/Step switch
    this.sswAudibleAlarm = 0;           // Audible alarm

    // Control Console switches
    this.cswPOSuppress = 0;             // Print-out suppress
    this.cswSkip = 0;                   // Skip instruction
    this.cswAudibleAlarm = 0;           // Audible alarm
    this.cswOutput = 0;                 // Output knob: 0=Off, 1=Page, 2=Tape
    this.cswInput = 0;                  // Input knob: 0=Mechanical reader, 1=Optical reader, 2=Keyboard
    this.cswBreakpoint = 0;             // Breakpoint knob: 0=Off, 1, 2, 4

    // Processor throttling control
    this.totalCycles = 0;               // Total cycles executed on this processor
    this.procStart = 0;                 // Javascript time that the processor started running, ms
    this.procTime = 0.001;              // Total processor running time, ms
    this.procSlack = 0;                 // Total processor throttling delay, ms
    this.procSlackAvg = 0;              // Average slack time per time slice, ms
    this.procRunAvg = 0;                // Average run time per time slice, ms
    this.delayDeltaAvg = 0;             // Average difference between requested and actual setCallback() delays, ms
    this.delayLastStamp = 0;            // Timestamp of last setCallback() delay, ms
    this.delayRequested = 0;            // Last requested setCallback() delay, ms
}

/**************************************/

/* Global constants */
D205Processor.version = "0.00";

D205Processor.cyclesPerMilli = 1000;    // clock cycles per millisecond (1000 => 1.0 MHz)
D205Processor.timeSlice = 4000;         // this.run() time-slice, clocks
D205Processor.delayAlpha = 0.999;       // decay factor for exponential weighted average delay
D205Processor.slackAlpha = 0.9999;      // decay factor for exponential weighted average slack

D205Processor.pow2 = [ // powers of 2 from 0 to 52
                     0x1,              0x2,              0x4,              0x8,
                    0x10,             0x20,             0x40,             0x80,
                   0x100,            0x200,            0x400,            0x800,
                  0x1000,           0x2000,           0x4000,           0x8000,
                 0x10000,          0x20000,          0x40000,          0x80000,
                0x100000,         0x200000,         0x400000,         0x800000,
               0x1000000,        0x2000000,        0x4000000,        0x8000000,
              0x10000000,       0x20000000,       0x40000000,       0x80000000,
             0x100000000,      0x200000000,      0x400000000,      0x800000000,
            0x1000000000,     0x2000000000,     0x4000000000,     0x8000000000,
           0x10000000000,    0x20000000000,    0x40000000000,    0x80000000000,
          0x100000000000,   0x200000000000,   0x400000000000,   0x800000000000,
         0x1000000000000,  0x2000000000000,  0x4000000000000,  0x8000000000000,
        0x10000000000000];

D205Processor.mask2 = [ // (2**n)-1 For n From 0 to 52
                     0x0,              0x1,              0x3,              0x7,
                    0x0F,             0x1F,             0x3F,             0x7F,
                   0x0FF,            0x1FF,            0x3FF,            0x7FF,
                  0x0FFF,           0x1FFF,           0x3FFF,           0x7FFF,
                 0x0FFFF,          0x1FFFF,          0x3FFFF,          0x7FFFF,
                0x0FFFFF,         0x1FFFFF,         0x3FFFFF,         0x7FFFFF,
               0x0FFFFFF,        0x1FFFFFF,        0x3FFFFFF,        0x7FFFFFF,
              0x0FFFFFFF,       0x1FFFFFFF,       0x3FFFFFFF,       0x7FFFFFFF,
             0x0FFFFFFFF,      0x1FFFFFFFF,      0x3FFFFFFFF,      0x7FFFFFFFF,
            0x0FFFFFFFFF,     0x1FFFFFFFFF,     0x3FFFFFFFFF,     0x7FFFFFFFFF,
           0x0FFFFFFFFFF,    0x1FFFFFFFFFF,    0x3FFFFFFFFFF,    0x7FFFFFFFFFF,
          0x0FFFFFFFFFFF,   0x1FFFFFFFFFFF,   0x3FFFFFFFFFFF  , 0x7FFFFFFFFFFF,
         0x0FFFFFFFFFFFF,  0x1FFFFFFFFFFFF,  0x3FFFFFFFFFFFF,  0x7FFFFFFFFFFFF,
        0x0FFFFFFFFFFFFF] ;

/**************************************/
D205Processor.prototype.clear = function clear() {
    /* Initializes (and if necessary, creates) the processor state */

    this.clearControl();

    // Registers
    this.A = 0;                         // A register - accumulator
    this.B = 0;                         // B register - index, loop control
    this.C = 0;                         // C register - current operator, control counter
    this.D = 0;                         // D register - input buffer from memory and I/O
    this.R = 0;                         // R register - accumulator extension

    // Adder registers
    this.ADDER = 0;                     // The adder
    this.CT = 0;                        // Carry toggles for the adder

    // Operational toggles
    this.poweredOn = 0;                 // System is powered on and initialized
    this.togTiming = 0;                 // Timing toggle: 0=execute, 1=fetch

    // Halt/error toggles
    this.stopOverflow = 0;              // Halted due to overflow
    this.stopSector = 0;                // Halted due to sector alarm
    this.stopForbidden = 0;             // Halted due to forbidden combination
    this.stopControl = 0;               // Halted due to Stop operator (08) or overflow
    this.stopIdle = 0;                  // Halted or in step mode

    // Memory control toggles
    this.memMAIN = 0;                   // Access is to main memory
    this.memRWM = 0;                    // Read/write main memory
    this.memRWL = 0;                    // Read/write loop memory
    this.memWDBL = 0;                   // Word or block transfer
    this.memACT = 0;                    // Memory access ACTION toggle
    this.memACCESS = 0;                 // Memory access active toggle
    this.memLM = 0;                     // Loop/main access toggle
    this.memL4 = 0;                     // 4000 loop access
    this.memL5 = 0;                     // 5000 loop access
    this.memL6 = 0;                     // 6000 loop access
    this.memL7 = 0;                     // 7000 loop access

    // Emulator control
    this.busy = 0;                      // Processor is running, not idle or halted
    this.cycleCount = 0;                // Cycle count for current syllable
    this.cycleLimit = 0;                // Cycle limit for this.run()
    this.runCycles = 0;                 // Current cycle cound for this.run()
};

/**************************************/
D205Processor.prototype.clearControl = function clearControl() {
    /* Initializes (and if necessary, creates) the processor control toggles */

    this.SHIFT = 0;                     // Shift counter
    this.SHIFTCONTROL = 0;              // Shift control register
    this.SPECIAL = 0;                   // Special counter

    // Toggles (flip-flops)
    this.togBTOAIN = 0;                 // B-to-A, Input toggle
    this.togADDER = 0;                  // Adder toggle
    this.togDPCTR = 0;                  // Digit-pulse toggle: on during decimal-correct, off during complement
    this.togDELTABDIV = 0;              // Delta-B, divide toggle
    this.togCOMPL = 0;                  // Complement toggle
    this.togPLUSAB = 0;                 // Plus-A, plus-B toggle
    this.togCLEAR = 0;                  // Clear toggle
    this.togMULDIV = 0;                 // Multiply-divide toggle
    this.togSIGN = 0;                   // Sign toggle
    this.togCOUNT = 0;                  // Count toggle
    this.togDIVALARM = 0;               // Divide alarm
    this.togSTEP = 0;                   // Step toggle
    this.togSTART = 0;                  // Input control: Start toggle
    this.togTF = 0;                     // Input control: FINISH pulse toggle
    this.togTC1 = 0;                    // Input control: clock pulse toggle (from input device)
    this.togTC2 = 0;                    // Input control: clock pulse toggle (shift input digit to D sign)
    this.togOK = 0;                     // Output control: OK toggle (output device ready for next digit)
    this.togPO1 = 0;                    // Output control: PO1 toggle (actual print-out to begin)
    this.togPO2 = 0;                    // Output control: PO2 toggle (on at start of digit output)
    this.togDELAY = 0;                  // Output control: Delay toggle
    this.togT0 = 0;                     // Central control: T0 toggle
    this.togBKPT = 0;                   // Central control: breakpoint toggle
    this.togZCT = 0;                    // Central control: zero check toggle
    this.togASYNC = 0;                  // Central control: async toggle
    this.togMT3P = 0;                   // Magnetic tape: 3PT toggle
    this.togMT1BV4 = 0;                 // Magnetic tape: 1BV4 toggle
    this.togMT1BV5 = 0;                 // Magnetic tape: 1BV5 toggle

    // Cardatron toggles
    this.togTWA = 0;                    // Cardatron: TWA toggle
    this.togBIO = 0;                    // Cardatron: BIO toggle
};


/**************************************/
D205Processor.bindMethod = function bindMethod(context, f) {
    /* Returns a new function that binds the function "f" to the object "context".
    Note that this is a static constructor property function, NOT an instance
    method of the CC object */

    return function bindMethodAnon() {f.apply(context, arguments)};
};

/**************************************/
D205Processor.prototype.bitTest = function bitTest(word, bit) {
    /* Extracts and returns the specified bit from the word */
    var p;                              // bottom portion of word power of 2

    if (bit > 0) {
        return ((word - word % (p = D205Processor.pow2[bit]))/p) % 2;
    } else {
        return word % 2;
    }
};

/**************************************/
D205Processor.prototype.bitSet = function bitSet(word, bit) {
    /* Sets the specified bit in word and returns the updated word */
    var ue = bit+1;                     // word upper power exponent
    var bpower =                        // bottom portion of word power of 2
        D205Processor.pow2[bit];
    var bottom =                        // unaffected bottom portion of word
        (bit <= 0 ? 0 : (word % bpower));
    var top =                           // unaffected top portion of word
        word - (word % D205Processor.pow2[ue]);

    return bpower + top + bottom;
};

/**************************************/
D205Processor.prototype.bitReset = function bitReset(word, bit) {
    /* Resets the specified bit in word and returns the updated word */
    var ue = bit+1;                     // word upper power exponent
    var bottom =                        // unaffected bottom portion of word
        (bit <= 0 ? 0 : (word % D205Processor.pow2[bit]));
    var top =                           // unaffected top portion of word
        word - (word % D205Processor.pow2[ue]);

    return top + bottom;
};

/**************************************/
D205Processor.prototype.bitFlip = function bitFlip(word, bit) {
    /* Complements the specified bit in word and returns the updated word */
    var ue = bit+1;                     // word upper power exponent
    var bpower =                        // bottom portion of word power of 2
        D205Processor.pow2[bit];
    var bottom =                        // unaffected bottom portion of word
        (bit <= 0 ? 0 : (word % bpower));
    var middle =                        // bottom portion of word starting with affected bit
        word % D205Processor.pow2[ue];
    var top = word - middle;            // unaffected top portion of word

    if (middle >= bpower) {             // if the affected bit is a one
        return top + bottom;                // return the result with it set to zero
    } else {                            // otherwise
        return bpower + top + bottom;       // return the result with it set to one
    }
};

/**************************************/
D205Processor.prototype.fieldIsolate = function fieldIsolate(word, start, width) {
    /* Extracts a bit field [start:width] from word and returns the field */
    var le = start-width+1;             // lower power exponent
    var p;                              // bottom portion of word power of 2

    return (le <= 0 ? word :
                      (word - word % (p = D205Processor.pow2[le]))/p
            ) % D205Processor.pow2[width];
};

/**************************************/
D205Processor.prototype.fieldInsert = function fieldInsert(word, start, width, value) {
    /* Inserts a bit field from the low-order bits of value ([48-width:width])
    into word.[start:width] and returns the updated word */
    var ue = start+1;                   // word upper power exponent
    var le = ue-width;                  // word lower power exponent
    var bpower =                        // bottom portion of word power of 2
        D205Processor.pow2[le];
    var bottom =                        // unaffected bottom portion of word
        (le <= 0 ? 0 : (word % bpower));
    var top =                           // unaffected top portion of word
        (ue <= 0 ? 0 : (word - (word % D205Processor.pow2[ue])));

    return (value % D205Processor.pow2[width])*bpower + top + bottom;
};

/**************************************/
D205Processor.prototype.fieldTransfer = function fieldTransfer(word, wstart, width, value, vstart) {
    /* Inserts a bit field from value.[vstart:width] into word.[wstart:width] and
    returns the updated word */
    var ue = wstart+1;                  // word upper power exponent
    var le = ue-width;                  // word lower power exponent
    var ve = vstart-width+1;            // value lower power exponent
    var vpower;                         // bottom port of value power of 2
    var bpower =                        // bottom portion of word power of 2
        D205Processor.pow2[le];
    var bottom =                        // unaffected bottom portion of word
        (le <= 0 ? 0 : (word % bpower));
    var top =                           // unaffected top portion of word
        (ue <= 0 ? 0 : (word - (word % D205Processor.pow2[ue])));

    return ((ve <= 0 ? value :
                       (value - value % (vpower = D205Processor.pow2[ve]))/vpower
                ) % D205Processor.pow2[width]
            )*bpower + top + bottom;
};

/**************************************/
D205Processor.prototype.serialAdd = function serialAdd(a, d) {
    /* Algebraically add the augend (a) to the addend (d), returning the result
    as the function value. All values are BCD with the sign in the 11th digit
    position. Sets the Overflow and Forbidden Combination stops as necessary */
    var ad;                             // current augend (a) digit;
    var adder = 0;                      // local copy of adder digit
    var am = a % 0x10000000000;         // augend mantissa
    var aSign = ((a - am)/0x10000000000) & 0x01;
    var carry;                          // local copy of carry toggle (CT 1)
    var compl;                          // local copy of complement toggle
    var ct;                             // local copy of carry register (CT 1-16)
    var dd;                             // current addend (d) digit;
    var dm = d % 0x10000000000;         // addend mantissa
    var dSign = ((d - dm)/0x10000000000) & 0x01;
    var sign = dSign;                   // local copy of sign toggle
    var x;                              // digit counter

    this.togADDER = 1;
    this.togDPCTR = 1;
    compl = (aSign == dSign ? 0 : 1);
    ct = carry = compl;

    // Loop through the 11 digits including signs (which were set to zero in am and dm)
    for (x=0; x<11; ++x) {
        // shift low-order augend digit right into the adder
        ad = am % 0x10;
        am = (am - ad)/0x10;
        if (ad > 9) {
            this.stopForbidden = 1;
        }

        // add the digits plus carry, complementing as necessary
        dd = dm % 0x10;
        if (dd > 9) {
            this.stopForbidden = 1;
        }
        if (compl) {
            ad = 9-ad;
        }
        adder = ad + dd + carry;

        // decimal correct the adder
        if (adder < 10) {
            carry = 0;
        } else {
            adder -= 10;
            carry = 1;
        }

        // compute the carry toggle register (just for display)
        ct = (((ad & dd) | (ad & ct) | (dd & ct)) << 1) + carry;
        // rotate the adder into the sign digit
        am += adder*0x10000000000;
        // shift the addend right to the next digit
        dm = (dm - dd)/0x10;
    } // for x

    // Now examine the resulting sign (still in the adder) to see if we have overflow
    // or need to recomplement the result
    if (adder == 0) {
        am += sign*0x10000000000;
    } else if (adder == 1) {
        am += (sign-1)*0x10000000000;
        this.stopOverflow = 1;
    } else {                            // sign is 9
        // reverse the sign toggle and recomplement the result (virtually adding to the zeroed dm)
        sign = 1-sign;
        compl = carry = 1;
        for (x=0; x<11; ++x) {
            ad = am % 0x10;
            am = (am - ad)/0x10;
            ad = 9-ad;
            adder = ad + carry;
            if (adder < 10) {
                carry = 0;
            } else {
                adder -= 10;
                carry = 1;
            }
            ct = ((ad & ct) << 1) + carry;
            am += adder*0x10000000000;
        } // for x

        // after recomplementing, set the correct sign (adder still contains sign of result)
        am += (sign-adder)*0x10000000000;
    }

    // set toggles for display purposes and return the result
    this.togCOMPL = compl;
    this.togSIGN = sign;
    this.CT = ct;
    this.ADDER = adder;
    return am;
};

/**************************************/
D205Processor.prototype.start = function start() {
    /* Initiates the processor by scheduling it on the Javascript thread */
    var stamp = performance.now();

    this.busy = 1;
    this.procStart = stamp;
    this.procTime -= stamp;
    this.delayLastStamp = stamp;
    this.delayRequested = 0;
    this.scheduler = setCallback(this.mnemonic, this, 0, this.schedule);
};

/**************************************/
D205Processor.prototype.stop = function stop() {
    /* Stops running the processor on the Javascript thread */
    var stamp = performance.now();

    this.T = 0;
    this.TROF = 0;              // idle the processor
    this.PROF = 0;
    this.busy = 0;
    this.cycleLimit = 0;        // exit this.run()
    if (this.scheduler) {
        clearCallback(this.scheduler);
        this.scheduler = 0;
    }
    while (this.procTime < 0) {
        this.procTime += stamp;
    }
};

/**************************************/
D205Processor.prototype.run = function run() {
    /* Instruction execution driver for the 205 processor. This function is
    an artifact of the emulator design and does not represent any physical
    process or state of the processor. This routine assumes the registers are
    set up -- in particular there must be a syllable in T with TROF set, the
    current program word must be in P with PROF set, and the C & L registers
    must point to the next syllable to be executed.
    This routine will continue to run while this.runCycles < this.cycleLimit  */
    var cc = this.cc;                   // optimize local reference to CentralControl
    var noSECL = 0;                     // to support char mode dynamic count from CRF syllable
    var opcode;                         // copy of T register
    var t1;                             // scratch variable for internal instruction use
    var t2;                             // ditto
    var t3;                             // ditto
    var t4;                             // ditto
    var variant;                        // high-order six bits of T register

    this.runCycles = 0;                 // initialze the cycle counter for this time slice
    do {
        this.Q = 0;
        this.Y = 0;
        this.Z = 0;
        opcode = this.T;
        this.cycleCount = 1;            // general syllable execution overhead

        if (this.CWMF) {
        } // end main switch for opcode dispatch

        /***************************************************************
        *   SECL: Syllable Execution Complete Level                    *
        ***************************************************************/

        if ((this.isP1 ? cc.IAR : (this.I || cc.HP2F)) && this.NCSF) {
            // there's an interrupt and we're in Normal State
            // reset Q09F (R-relative adder mode) and set Q07F (hardware-induced SFI) (for display only)
            this.Q = (this.Q & 0xFFFEFF) | 0x40;
            this.T = 0x0609;            // inject 3011=SFI into T
            this.storeForInterrupt(1, 0); // call directly to avoid resetting registers at top of loop
        } else {
            // otherwise, fetch the next instruction
            if (!this.PROF) {
                this.loadPviaC();
            }
            switch (this.L) {
            case 0:
                this.T = (((t1=this.P) - t1 % 0x1000000000) / 0x1000000000) % 0x1000;
                this.L = 1;
                break;
            case 1:
                this.T = (((t1=this.P) - t1 % 0x1000000) / 0x1000000) % 0x1000;
                this.L = 2;
                break;
            case 2:
                this.T = (((t1=this.P) - t1 % 0x1000) / 0x1000) % 0x1000;
                this.L = 3;
                break;
            case 3:
                this.T = this.P % 0x1000;
                this.L = 0;
                ++this.C;               // assume no Inhibit Fetch for now and bump C
                this.PROF = 0;          // invalidate current program word
                break;
            }
        }

        // Accumulate Normal and Control State cycles for use by Console in
        // making the pretty lights blink. If the processor is no longer busy,
        // accumulate the cycles as Normal State, as we probably just did SFI.
        if (this.NCSF || !this.busy) {
            this.normalCycles += this.cycleCount;
        } else {
            this.controlCycles += this.cycleCount;
        }
    } while ((this.runCycles += this.cycleCount) < this.cycleLimit);
};

/**************************************/
D205Processor.prototype.schedule = function schedule() {
    /* Schedules the processor running time and attempts to throttle performance
    to approximate that of a real 205 -- well, at least we hope this will run
    fast enough that the performance will need to be throttled. It establishes
    a timeslice in terms of a number of processor "cycles" of 1 microsecond
    each and calls run() to execute at most that number of cycles. run()
    counts up cycles until it reaches this limit or some terminating event
    (such as a halt), then exits back here. If the processor remains active,
    this routine will reschedule itself after an appropriate delay, thereby
    throttling the performance and allowing other modules a chance at the
    single Javascript execution thread */
    var clockOff = performance.now();   // ending time for the delay and the run() call, ms
    var delayTime;                      // delay from/until next run() for this processor, ms
    var runTime;                        // real-world processor running time, ms

    this.scheduler = 0;
    delayTime = clockOff - this.delayLastStamp;
    this.procSlack += delayTime;

    // Compute the exponential weighted average of scheduling delay
    this.delayDeltaAvg = (1-D205Processor.delayAlpha)*(delayTime - this.delayRequested) +
                         D205Processor.delayAlpha*this.delayDeltaAvg;
    this.procSlackAvg = (1-D205Processor.slackAlpha)*delayTime +
                        D205Processor.slackAlpha*this.procSlackAvg;

    if (this.busy) {
        this.cycleLimit = D205Processor.timeSlice;

        this.run();                     // execute syllables for the timeslice

        clockOff = performance.now();
        this.procRunAvg = (1.0-D205Processor.slackAlpha)*(clockOff - this.delayLastStamp) +
                     D205Processor.slackAlpha*this.procRunAvg;
        this.delayLastStamp = clockOff;
        this.totalCycles += this.runCycles;
        if (!this.busy) {
            this.delayRequested = 0;
        } else {
            runTime = this.procTime;
            while (runTime < 0) {
                runTime += clockOff;
            }

            delayTime = this.totalCycles/D205Processor.cyclesPerMilli - runTime;
            // delayTime is the number of milliseconds the processor is running ahead of
            // real-world time. Web browsers have a certain minimum setTimeout() delay. If the
            // delay is less than our estimate of that minimum, setCallback will yield to
            // the event loop but otherwise continue (real time should eventually catch up --
            // we hope). If the delay is greater than the minimum, setCallback will reschedule
            // us after that delay.

            this.delayRequested = delayTime;
            this.scheduler = setCallback(this.mnemonic, this, delayTime, this.schedule);
        }
    }
};

/**************************************/
D205Processor.prototype.step = function step() {
    /* Single-steps the processor. Normally this will cause one instruction to
    be executed, but note that in the case of an interrupt or char-mode CRF, one
    or two injected instructions (e.g., SFI followed by ITI) could also be executed */

    this.cycleLimit = 1;
    this.run();
    this.totalCycles += this.runCycles;
};
