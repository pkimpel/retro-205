/***********************************************************************
* retro-205/emulator D205Processor.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Emulator Processor (CPU) module.
*
* Instance variables in all caps generally refer to register or flip-flop (FF)
* entities in the processor hardware. See the following documents:
*
*   Burroughs 205 Handbook
*       (Bulletin 3021, Burroughs Corporation, 1956).
*   Programming and Coding Manual, Datatron
*       (Bulletin 3040A, ElectroData Corporation, 1954).
*   Handbook of Operating Procedures for the Burroughs 205
*       (Bulletin 3034A, Burroughs Corporation, May 1960).
*
* available at:
*   http://bitsavers.org/pdf/burroughs/electrodata/205/
*
* also:
*
*   TM4001 Datatron 205 Computer (Training Edition)
*       (Burroughs Corporation, December,1956).
*   Burroughs 205 Handbook: Floating Point Control Unit Model 36044
*       (Bulletin 3028, Burroughs Corporation 1957).
*   Engineering Description of the ElectroData Digital Computer, J. C. Alrich,
*       (IRE Transactions on Electronic Computers, vol EC-4, Number 1, March 1955).
*
* Datatron 205 word format:
*   44 bits, encoded as binary-coded decimal (BCD); non-decimal codes are invalid
*   and cause the computer to stop with a Forbidden Combination (FC) alarm.
*   High-order 4 bits are the "sign digit":
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
* Processor timing is maintained internally in units of "word-times": 1/200-th
* revolution of the memory drum, or about 84 µs at 3570rpm.
*
************************************************************************
* 2014-11-29  P.Kimpel
*   Original version, from thin air and a little bit of retro-B5500 code.
***********************************************************************/
"use strict";

/**************************************/
function D205Processor(config, devices) {
    /* Constructor for the 205 Processor module object */

    // Emulator control
    this.cardatron = null;              // Reference to Cardatron Control Unit
    this.config = config;               // Reference to SystemConfig object
    this.console = null;                // Reference to Control Console for I/O
    this.devices = devices;             // Hash of I/O device objects
    this.ioCallback = null;             // Current I/O interface callback function
    this.magTape = null;                // Reference to Magnetic Tape Control Unit
    this.poweredOn = 0;                 // System is powered on and initialized
    this.successor = null;              // Current delayed-action successor function

    // Memory
    this.memoryDrum = new ArrayBuffer(4080*8);                  // Drum: 4080 64-bit FP words
    this.MM = new Float64Array(this.memoryDrum, 0, 4000);       // Main memory, 4000 words
    this.L4 = new Float64Array(this.memoryDrum, 4000*8, 20);    // 4000 loop, 20 words
    this.L5 = new Float64Array(this.memoryDrum, 4020*8, 20);    // 5000 loop, 20 words
    this.L6 = new Float64Array(this.memoryDrum, 4040*8, 20);    // 6000 loop, 20 words
    this.L7 = new Float64Array(this.memoryDrum, 4060*8, 20);    // 7000 loop, 20 words

    // Supervisory Panel switches
    this.sswLockNormal = 0;             // Lock/Normal switch
    this.sswStepContinuous = 0;         // Step/Continuous switch
    this.sswAudibleAlarm = 0;           // Audible alarm

    // Control Console switches
    this.cswPOSuppress = 0;             // Print-out suppress
    this.cswSkip = 0;                   // Skip instruction
    this.cswAudibleAlarm = 0;           // Audible alarm
    this.cswOutput = 0;                 // Output knob: 0=Off, 1=Page, 2=Tape (mapped from actual knob values)
    this.cswInput = 0;                  // Input knob: 0=Mechanical reader, 1=Optical reader, 2=Keyboard
    this.cswBreakpoint = 0;             // Breakpoint knob: 0=Off, 1, 2, 4

    // Mag-Tape Control Unit switch
    this.tswSuppressB = 0;              // Suppress B-register modification on input

    // Context-bound routines
    this.boundExecuteComplete = D205Processor.prototype.executeComplete.bind(this);
    this.boundUpdateLampGlow = D205Processor.prototype.updateLampGlow.bind(this);

    this.boundConsoleOutputSignDigit = D205Processor.prototype.consoleOutputSignDigit.bind(this);
    this.boundConsoleOutputNumberDigit= D205Processor.prototype.consoleOutputNumberDigit.bind(this);
    this.boundConsoleOutputFinished = D205Processor.prototype.consoleOutputFinished.bind(this);
    this.boundConsoleRequestDigit = D205Processor.prototype.consoleRequestDigit.bind(this);
    this.boundConsoleReceiveDigit = D205Processor.prototype.consoleReceiveDigit.bind(this);
    this.boundConsoleReceiveSingleDigit = D205Processor.prototype.consoleReceiveSingleDigit.bind(this);

    this.boundCardatronOutputWordReady = D205Processor.prototype.cardatronOutputWordReady.bind(this);
    this.boundCardatronOutputWord= D205Processor.prototype.cardatronOutputWord.bind(this);
    this.boundCardatronOutputFinished = D205Processor.prototype.cardatronOutputFinished.bind(this);
    this.boundCardatronInputWord = D205Processor.prototype.cardatronInputWord.bind(this);
    this.boundCardatronReceiveWord = D205Processor.prototype.cardatronReceiveWord.bind(this);

    this.boundMagTapeReceiveBlock = D205Processor.prototype.magTapeReceiveBlock.bind(this);
    this.boundMagTapeInitiateSend = D205Processor.prototype.magTapeInitiateSend.bind(this);
    this.boundMagTapeSendBlock = D205Processor.prototype.magTapeSendBlock.bind(this);
    this.boundMagTapeTerminateSend = D205Processor.prototype.magTapeTerminateSend.bind(this);

    // Processor throttling control
    this.scheduler = 0;                 // Current setCallback token
    this.procStart = 0;                 // Javascript time that the processor started running, ms
    this.procTime = 0;                  // Total processor running time, ms

    // External switches [used by EXC (71)]
    this.externalSwitch = [0, 0, 0, 0, 0, 0, 0, 0];

    // Register average-intensity accumulators
    this.glowTimer = null;
    this.toggleGlow = {
        glowA: new Float64Array(44),
        glowB: new Float64Array(16),
        glowC: new Float64Array(40),
        glowD: new Float64Array(44),
        glowR: new Float64Array(40),
        glowCtl: new Float64Array(40),
        glowADDER: new Float64Array(4),
        glowCT: new Float64Array(5),
        glowTiming: 0,
        glowOverflow: 0,
        glowTWA: 0,
        glow3IO: 0,
        glowMAIN: 0,
        glowRWM: 0,
        glowRWL: 0,
        glowWDBL: 0,
        glowACTION: 0,
        glowACCESS: 0,
        glowLM: 0,
        glowL4: 0,
        glowL5: 0,
        glowL6: 0,
        glowL7: 0};

    this.clear();                       // Create and initialize the processor state

    this.loadDefaultProgram();          // Preload a default program
}


/***********************************************************************
*   Global Constants                                                   *
***********************************************************************/

D205Processor.version = "1.02";

D205Processor.drumRPM = 3570;           // memory drum speed, RPM
D205Processor.trackSize = 200;          // words per drum revolution
D205Processor.loopSize = 20;            // words per high-speed loop
D205Processor.wordTime = 60000/D205Processor.drumRPM/D205Processor.trackSize;
                                        // one word time, about 0.084 ms at 3570rpm (=> 142.8 KHz)
D205Processor.wordsPerMilli = 1/D205Processor.wordTime;
                                        // word times per millisecond
D205Processor.memSetupTime = 2;         // word times to set up a memory access

D205Processor.neonPersistence = 1000/30;
                                        // persistence of neon bulb glow [ms]
D205Processor.maxGlowTime = D205Processor.neonPersistence*D205Processor.wordsPerMilli;
                                        // panel bulb glow persistence [word-times]
D205Processor.lampGlowInterval = 50;    // background lamp sampling interval (ms)
D205Processor.adderGlowAlpha = D205Processor.wordTime/12/D205Processor.neonPersistence;
                                        // adder and carry toggle glow decay factor,
                                        // based on one digit (1/12 word) time

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

D205Processor.mask2 = [ // (2**n)-1 for n from 0 to 52
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


/***********************************************************************
*   Utility Functions                                                  *
***********************************************************************/

/**************************************/
D205Processor.bcdBinary = function bcdBinary(v) {
    /* Converts the BCD value "v" to a binary number and returns it */
    var d;
    var power = 1;
    var result = 0;

    while(v) {
        d = v % 0x10;
        result += d*power;
        power *= 10;
        v = (v-d)/0x10;
    }
    return result;
};

/**************************************/
D205Processor.binaryBCD = function binaryBCD(v) {
    /* Converts the binary value "v" to a BCD number and returns it */
    var d;
    var power = 1;
    var result = 0;

    while(v) {
        d = v % 10;
        result += d*power;
        power *= 0x10;
        v = (v-d)/10;
    }
    return result;
};


/***********************************************************************
*   Bit and Field Manipulation Functions                               *
***********************************************************************/

/**************************************/
D205Processor.bitTest = function bitTest(word, bit) {
    /* Extracts and returns the specified bit from the word */
    var p;                              // bottom portion of word power of 2

    if (bit > 0) {
        return ((word - word % (p = D205Processor.pow2[bit]))/p) % 2;
    } else {
        return word % 2;
    }
};

/**************************************/
D205Processor.bitSet = function bitSet(word, bit) {
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
D205Processor.bitReset = function bitReset(word, bit) {
    /* Resets the specified bit in word and returns the updated word */
    var ue = bit+1;                     // word upper power exponent
    var bottom =                        // unaffected bottom portion of word
        (bit <= 0 ? 0 : (word % D205Processor.pow2[bit]));
    var top =                           // unaffected top portion of word
        word - (word % D205Processor.pow2[ue]);

    return top + bottom;
};

/**************************************/
D205Processor.bitFlip = function bitFlip(word, bit) {
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
D205Processor.fieldIsolate = function fieldIsolate(word, start, width) {
    /* Extracts a bit field [start:width] from word and returns the field */
    var le = start-width+1;             // lower power exponent
    var p;                              // bottom portion of word power of 2

    return (le <= 0 ? word :
                      (word - word % (p = D205Processor.pow2[le]))/p
            ) % D205Processor.pow2[width];
};

/**************************************/
D205Processor.fieldInsert = function fieldInsert(word, start, width, value) {
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
D205Processor.fieldTransfer = function fieldTransfer(word, wstart, width, value, vstart) {
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


/***********************************************************************
*   System Clear                                                       *
***********************************************************************/

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

    this.COP = 0;                       // copy of C register op code (2 digits)
    this.CADDR = 0;                     // copy of C register operand address (4 digits)
    this.CCONTROL = 0;                  // copy of C register control address (4 digits)
    this.CEXTRA = 0;                    // high-order four digits of instruction word + sign

    // Adder registers
    this.ADDER = 0;                     // The adder
    this.CT = 0;                        // Carry toggles for the adder

    // Operational toggles
    this.togTiming = 1;                 // Timing toggle: 0=execute, 1=fetch
    this.togCST = 1;                    // Computer Stop toggle (?)
    this.cctContinuous = 0;             // Console step(0) / continuous(1) toggle

    // Halt/error toggles
    this.stopOverflow = 0;              // Halted due to overflow
    this.stopSector = 0;                // Halted due to sector alarm
    this.stopForbidden = 0;             // Halted due to forbidden combination
    this.stopControl = 0;               // Halted due to Stop operator (08) or overflow
    this.stopBreakpoint = 0;            // Halted due to breakpoint
    this.stopIdle = 1;                  // Halted or in step mode

    // Memory control toggles
    this.memMAIN = 0;                   // Access is to main memory
    this.memRWM = 0;                    // Read/write main memory
    this.memRWL = 0;                    // Read/write loop memory
    this.memWDBL = 0;                   // Word or block transfer
    this.memACTION = 0;                 // Memory access ACTION toggle
    this.memACCESS = 0;                 // Memory access active toggle
    this.memLM = 0;                     // Loop/main access toggle
    this.memL4 = 0;                     // 4000 loop access
    this.memL5 = 0;                     // 5000 loop access
    this.memL6 = 0;                     // 6000 loop access
    this.memL7 = 0;                     // 7000 loop access

    // Statistics timers
    this.lastGlowTime = 0;              // Last panel lamp intensity update time [word-times]
    this.memoryStartTime = 0;           // Start of last memory access [word-times]
    this.memoryStopTime = 0;            // End of last memory access [word-times]

    this.setTimingToggle(0);            // set to Execute initially
    this.sampleLamps(1.0, 1.0);         // initialize the lamp-glow averages

    // Kill any pending action that may be in process
    if (this.scheduler) {
        clearCallback(this.scheduler);
        this.scheduler = 0;
    }

    // Clear Cardatron Control Unit
    if (this.cardatron) {
        this.cardatron.clear();
    }
};

/**************************************/
D205Processor.prototype.clearControlToggles = function clearControlToggles() {
    /* Clears the processor control toggles at end of an execution cycle.
    The adder and carry toggles should also be cleared as part of this, but
    they are often zero anyway, and we are only doing this for display purposes,
    so leave them as is */

    this.togADDER =                     // Adder toggle
    this.togBTOAIN = 0;                 // B-to-A, Input toggle
    this.togDPCTR =                     // Digit-pulse toggle: on during decimal-correct, off during complement
    this.togDELTABDIV =                 // Delta-B, divide toggle
    this.togCOMPL =                     // Complement toggle
    this.togADDAB =                     // Add-A/add-B toggle
    this.togCLEAR =                     // Clear toggle
    this.togMULDIV =                    // Multiply-divide toggle
    this.togSIGN =                      // Sign toggle
    this.togCOUNT =                     // Count toggle
    this.togDIVALARM =                  // Divide alarm
    this.togSTEP = 0;                   // Step toggle
};

/**************************************/
D205Processor.prototype.clearControl = function clearControl() {
    /* Initializes (and if necessary, creates) the processor control registers
    and toggles */

    this.SHIFT = 0;                     // Shift counter
    this.SHIFTCONTROL = 0;              // Shift control register
    this.SPECIAL = 0;                   // Special counter

    // Toggles (flip-flops)
    this.clearControlToggles();         // the standard set
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
    this.togMT3P = 0;                   // Magnetic tape: 3P toggle
    this.togMT1BV4 = 0;                 // Magnetic tape: 1BV4 toggle
    this.togMT1BV5 = 0;                 // Magnetic tape: 1BV5 toggle

    // Cardatron toggles
    this.togTWA = 0;                    // Cardatron: TWA toggle
    this.tog3IO = 0;                    // Cardatron: 3IO toggle

    // I/O globals
    this.kDigit = 0;                    // variant/format digits from upper part of instruction
    this.selectedUnit = 0;              // currently-selected unit number
};


/***********************************************************************
* Timing and Statistics Functions                                      *
***********************************************************************/

/**************************************/
D205Processor.prototype.setTimingToggle = function setTimingToggle(cycle) {
    /* Sets the timing toggle to the value of "cycle": 0=Execute, !0=Fetch */

    this.togTiming = (cycle ? 1 : 0);
};

/**************************************/
D205Processor.prototype.setOverflow = function setOverflow(overflow) {
    /* Sets the overflow toggle to the value of "overflow" */

    this.stopOverflow = (overflow ? 1 : 0);
};

/**************************************/
D205Processor.prototype.feelTheGlow = function feelTheGlow(alpha, alpha1, glow, bits, r) {
    /* Computes the running exponential average of lamp intensities for register
    "r" in the low-order "bits" bits, using the "alpha" decay factor into the array
    "glow". alpha1 must be 1.0 - alpha */
    var b = 0;
    var bit;

    while (r) {
        bit = r % 2;
        r = (r-bit)/2;
        glow[b] = glow[b]*alpha1 + bit*alpha;
        ++b;
    }

    while (b < bits) {
        glow[b] *= alpha1;
        ++b;
    }
};

/**************************************/
D205Processor.prototype.updateAdderGlow = function updateAdderGlow(adder, ct) {
    /* Computes the exponential running average of adder and carry toggle bit
    intensities. This is called for every digit passing through the adder, and
    serves only to compute a range of bit-by-bit intensities (0,1) for display */
    var alpha = D205Processor.adderGlowAlpha;
    var alpha1 = 1.0 - alpha;
    var b = 0;
    var bit;
    var glowA = this.toggleGlow.glowADDER;
    var glowC = this.toggleGlow.glowCT;

    while (b < 4) {
        bit = adder % 2;
        adder = (adder-bit)/2;
        glowA[b] = glowA[b]*alpha1 + bit*alpha;
        ++b;
    }

    b = 0;
    while (b < 5) {
        bit = ct % 2;
        ct = (ct-bit)/2;
        glowC[b] = glowC[b]*alpha1 + bit*alpha;
        ++b;
    }
};

/**************************************/
D205Processor.prototype.sampleLamps = function sampleLamps(alpha, memAlpha) {
    /* Updates the lamp intensity arrays for all registers. "alpha" and "memAlpha"
    must be in the range (0-,1) and indicate the relative significance for the current
    register settings to the running exponential average algorithm */
    var alpha1 = 1.0 - alpha;
    var tg = this.toggleGlow;

    tg.glowTiming =   tg.glowTiming*alpha1 +   this.togTiming*alpha;
    tg.glowOverflow = tg.glowOverflow*alpha1 + this.stopOverflow*alpha;
    tg.glowTWA =      tg.glowTWA*alpha1 +      this.togTWA*alpha;
    tg.glow3IO =      tg.glow3IO*alpha1 +      this.tog3IO*alpha;

    this.feelTheGlow(alpha, alpha1, tg.glowA, 44, this.A);
    this.feelTheGlow(alpha, alpha1, tg.glowB, 16, this.B);
    this.feelTheGlow(alpha, alpha1, tg.glowC, 40, this.C);
    this.feelTheGlow(alpha, alpha1, tg.glowD, 44, this.D);
    this.feelTheGlow(alpha, alpha1, tg.glowR, 40, this.R);

    this.feelTheGlow(alpha, alpha1, tg.glowADDER, 4, this.ADDER);
    this.feelTheGlow(alpha, alpha1, tg.glowCT, 5, this.CT);

    this.feelTheGlow(alpha, alpha1, tg.glowCtl, 40, ((((((((((((((((((((((((((((
                this.SPECIAL*2 +
                this.togBTOAIN)*2 +
                this.togADDER)*2 +
                this.togDPCTR)*2 +
                this.togDELTABDIV)*2 +
                this.togCOMPL)*2 +
                this.togADDAB)*2 +
                this.togCLEAR)*2 +
                this.togMULDIV)*2 +
                this.togSIGN)*2 +
                this.togCOUNT)*2 +
                this.togDIVALARM)*2 +
                this.togSTEP)*2 +
                this.togSTART)*2 +
                this.togTF)*2 +
                this.togTC1)*2 +
                this.togTC2)*2 +
                this.togOK)*2 +
                this.togPO1)*2 +
                this.togPO2)*2 +
                this.togDELAY)*2 +
                this.togT0)*2 +
                this.togBKPT)*2 +
                this.togZCT)*2 +
                this.togASYNC)*0x10 +
                this.SHIFTCONTROL)*2 +
                this.togMT3P)*2 +
                this.togMT1BV4)*2 +
                this.togMT1BV5)*0x20 +
                this.SHIFT);

    // Decay the memory toggles if no memory access is in progress
    if (this.memoryStartTime == 0) {
        alpha1 = 1.0 - memAlpha;
        tg.glowMAIN =   tg.glowMAIN*alpha1;
        tg.glowRWM =    tg.glowRWM*alpha1;
        tg.glowRWL =    tg.glowRWL*alpha1;
        tg.glowWDBL =   tg.glowWDBL*alpha1;
        tg.glowACTION = tg.glowACTION*alpha1;
        tg.glowACCESS = tg.glowACCESS*alpha1;
        tg.glowLM =     tg.glowLM*alpha1;
        tg.glowL4 =     tg.glowL4*alpha1;
        tg.glowL5 =     tg.glowL5*alpha1;
        tg.glowL6 =     tg.glowL6*alpha1;
        tg.glowL7 =     tg.glowL7*alpha1;
    }
};

/**************************************/
D205Processor.prototype.updateLampGlow = function updateLampGlow(drumTime) {
    /* Computes an alpha factor based on the elapsed time since the last sampling,
    then calls sampleLamps() to update the running averages. drumTime is the
    current time in word-time units, 0.084ms. If drumTime is zero or undefined,
    the current time is used */
    var clock = drumTime || performance.now()*D205Processor.wordsPerMilli;
    var alpha = Math.min((clock - this.lastGlowTime)/D205Processor.maxGlowTime, 1.0);
    var memAlpha = Math.min((clock - this.memoryStopTime)/D205Processor.maxGlowTime, 1.0);

    this.sampleLamps(alpha, memAlpha);
    this.lastGlowTime = clock;
};

/**************************************/
D205Processor.prototype.startMemoryTiming = function startMemoryTiming(
        drumTime, latency, words, cbCategory, successor, finish, finishParam) {
    /* Starts the necessary timers for the memory toggles to aid in their
    display on the panels. Then delays the amount of time required for drum
    latency, data transfer, and amount necessary to bring the processor internal
    time back in sync with real-world time. Note that "drumTime" is in units of
    word-times */

    this.updateLampGlow(drumTime);
    this.memoryStartTime = drumTime;

    this.procTime += latency + words + D205Processor.memSetupTime; // emulated time at end of drum access
    this.memACTION = 1;
    this.successor = successor;
    this.scheduler = setCallback(cbCategory, this,
            (this.procTime-drumTime)/D205Processor.wordsPerMilli, finish, finishParam);
};

/**************************************/
D205Processor.prototype.stopMemoryTiming = function stopMemoryTiming() {
    /* Stops the active timers for the memory toggles to aid in their
    display on the panels and reset the corresponding toggle */
    var drumTime = performance.now()*D205Processor.wordsPerMilli;
    var alpha = Math.min((drumTime - this.memoryStartTime)/D205Processor.maxGlowTime, 1.0);
    var alpha1 = 1.0 - alpha;
    var tg = this.toggleGlow;

    tg.glowMAIN =   tg.glowMAIN*alpha1 +   this.memMAIN*alpha;
    tg.glowRWM =    tg.glowRWM*alpha1 +    this.memRWM*alpha;
    tg.glowRWL =    tg.glowRWL*alpha1 +    this.memRWL*alpha;
    tg.glowWDBL =   tg.glowWDBL*alpha1 +   this.memWDBL*alpha;
    tg.glowACTION = tg.glowACTION*alpha1 + this.memACTION*alpha;
    tg.glowACCESS = tg.glowACCESS*alpha1 + this.memACCESS*alpha;
    tg.glowLM =     tg.glowLM*alpha1 +     this.memLM*alpha;
    tg.glowL4 =     tg.glowL4*alpha1 +     this.memL4*alpha;
    tg.glowL5 =     tg.glowL5*alpha1 +     this.memL5*alpha;
    tg.glowL6 =     tg.glowL6*alpha1 +     this.memL6*alpha;
    tg.glowL7 =     tg.glowL7*alpha1 +     this.memL7*alpha;

    this.memoryStopTime = drumTime;
    this.memoryStartTime =
            this.memMAIN =
            this.memRWM =
            this.memRWL =
            this.memWDBL =
            this.memACTION =
            this.memACCESS =
            this.memLM =
            this.memL4 =
            this.memL5 =
            this.memL6 =
            this.memL7 = 0;
};


/***********************************************************************
*   The 205 Adder and Arithmetic Operations                            *
***********************************************************************/

/**************************************/
D205Processor.prototype.bcdAdd = function bcdAdd(a, d, complement, initialCarry) {
    /* Performs an unsigned, BCD addition of "a" and "d", producing an 11-digit
    BCD result. On input, "complement" indicates whether 9s-complement addition
    should be performed; "initialCarry" indicates whether an initial carry of 1
    should be applied to the adder. On output, this.togCOMPL will be set from
    "complement" and this.CT is set from the final carry toggles of the addition.
    Further, this.ADDER will still have a copy of the sign (11th) digit. Sets
    the Forbidden-Combination stop if non-decimal digits are encountered, but
    does not set the Overflow stop. */
    var ad;                             // current augend (a) digit;
    var adder;                          // local copy of adder digit
    var am = a % 0x100000000000;        // augend mantissa
    var carry = (initialCarry || 0) & 1;// local copy of carry toggle (CT 1)
    var compl = complement || 0;        // local copy of complement toggle
    var ct = carry;                     // local copy of carry register (CT 1-16)
    var dd;                             // current addend (d) digit;
    var dm = d % 0x100000000000;        // addend mantissa
    var x;                              // digit counter

    this.togADDER = 1;                  // for display only
    this.togDPCTR = 1;                  // for display only

    // Loop through the 11 digits including sign digits
    for (x=0; x<11; ++x) {
        // Shift low-order augend digit right into the adder
        ad = am % 0x10;
        am = (am - ad)/0x10;
        if (ad > 9) {
            this.stopForbidden = 1;
            this.togCST = 1;            // halt the processor
        } else if (compl) {
            ad = 9-ad;
        }

        // Add the digits plus carry, complementing as necessary
        dd = dm % 0x10;
        if (dd > 9) {
            this.stopForbidden = 1;
            this.togCST = 1;            // halt the processor
        }

        adder = ad + dd + carry;

        // Decimal-correct the adder
        if (adder < 10) {
            carry = 0;
        } else {
            adder -= 10;
            carry = 1;
        }

        // Compute the carry toggle register (just for display)
        ct = (((ad & dd) | (ad & ct) | (dd & ct)) << 1) + carry;
        this.updateAdderGlow(adder, ct);

        // Rotate the adder into the sign digit
        am += adder*0x10000000000;
        // Shift the addend right to the next digit
        dm = (dm - dd)/0x10;
    } // for x

    // Set toggles for display purposes and return the result
    this.togCOMPL = compl;
    this.CT = ct;
    this.ADDER = adder;
    return am;
};

/**************************************/
D205Processor.prototype.integerAdd = function integerAdd() {
    /* Algebraically add the addend (D) to the augend (A), returning the result
    in A and clearing D. All values are BCD with the sign in the 11th digit
    position. Sets the Overflow and Forbidden-Combination stops as necessary */
    var am = this.A % 0x10000000000;    // augend mantissa
    var aSign = ((this.A - am)/0x10000000000);
    var compl;                          // complement addition required
    var dm = this.D % 0x10000000000;    // addend mantissa
    var dSign = ((this.D - dm)/0x10000000000);
    var sign = dSign & 0x01;            // local copy of sign toggle

    this.togADDER = 1;                  // for display only
    this.togDPCTR = 1;                  // for display only
    compl = (aSign^dSign) & 0x01;
    am = this.bcdAdd(am, dm, compl, compl);

    // Now examine the resulting sign (still in the adder) to see if we have overflow
    // or need to recomplement the result
    switch (this.ADDER) {
    case 0:
        am += sign*0x10000000000;
        break;
    case 1:
        am += (sign-1)*0x10000000000;
        this.setOverflow(1);
        break;
    default: // sign is 9
        // reverse the sign toggle and recomplement the result (virtually adding to the zeroed dm)
        sign = 1-sign;
        am = this.bcdAdd(am, 0, 1, 1);
        // after recomplementing, set the correct sign (adder still contains sign of result)
        am += (sign - this.ADDER)*0x10000000000;
        this.procTime += 2;
        break;
    } // switch this.ADDER

    // Set toggles for display purposes and return the result
    this.procTime += 6;                 // total = 6 + 2 if decomplement needed
    this.togSIGN = sign;
    this.A = am;
    this.D = 0;
};

/**************************************/
D205Processor.prototype.integerExtract = function integerExtract() {
    /* "Extract" digits from A according to the digit pattern in D.
    This is actually a weird form of add. In the simple case, the extract
    pattern  consists of a string of ones and zeroes. The value digits will be
    retained where the corresponding pattern digits are 1 and will be zeroed
    where the corresponding pattern digits are zero.
    In the general case, if the pattern digit is even, that digit replaces the
    corresponding digit in the value. If the pattern digit is odd, then that
    digit minus one is added to the corresponding value digit. In this latter
    case, carries from digit to digit occur normally, and thus a generalized
    extract can result in overflow.
    Sets the Overflow and Forbidden-Combination stops as necessary */
    var ad;                             // current value (A) digit;
    var adder = 0;                      // local copy of adder digit
    var am = this.A % 0x10000000000;    // value mantissa
    var aSign = ((this.A - am)/0x10000000000) & 0x01;
    var carry;                          // local copy of carry toggle (CT 1)
    var ct;                             // local copy of carry register (CT 1-16)
    var dd;                             // current pattern (D) digit;
    var dm = this.D;                    // pattern mantissa
    var dSign = ((this.D - this.D%0x10000000000)/0x10000000000);
    var sign = aSign & dSign & 0x01;    // local copy of sign toggle
    var x;                              // digit counter

    this.togCLEAR = 1;                  // for display only
    this.togADDER = 1;                  // for display only
    this.togDPCTR = 1;                  // for display only
    ct = carry = 0;

    // Loop through the 11 digits including signs (which were set to zero in am and dm)
    for (x=0; x<11; ++x) {
        // shift low-order value digit right into the adder
        ad = am % 0x10;
        am = (am - ad)/0x10;
        if (ad > 9) {
            this.stopForbidden = 1;
            this.togCST = 1;            // halt the processor
        }

        // add the digits plus carry, complementing as necessary
        dd = dm % 0x10;
        // shift the pattern right to the next digit
        dm = (dm - dd)/0x10;
        if (dd > 9) {
            this.stopForbidden = 1;
            this.togCST = 1;            // halt the processor
        }
        if (dd & 0x01) {                // if extract digit is odd
            dd &= 0x0E;                 // force extract digit to even (so adder=ad+dd-1)
        } else {                        // otherwise, if it's even
            ad = 0;                     // clear A digit so D digit will replace it (adder=dd)
        }
        adder = ad + dd + carry;

        // decimal-correct the adder
        if (adder < 10) {
            carry = 0;
        } else {
            adder -= 10;
            carry = 1;
        }

        // compute the carry toggle register (just for display)
        ct = (((ad & dd) | (ad & ct) | (dd & ct)) << 1) + carry;
        this.updateAdderGlow(adder, ct);

        // rotate the adder into the sign digit
        am += adder*0x10000000000;
    } // for x

    // Now examine the resulting sign (still in the adder) to see if we have overflow
    if (adder == 0) {
        am += sign*0x10000000000;
    } else if (adder == 1) {
        am += (sign-1)*0x10000000000;
        this.setOverflow(1);
    }

    // Set toggles for display purposes and return the result
    this.procTime += 6;
    this.togCOMPL = 0;
    this.togSIGN = sign;
    this.CT = ct;
    this.ADDER = adder;
    this.A = am;
    this.D = 0;
};

/**************************************/
D205Processor.prototype.integerMultiply = function integerMultiply(roundOff) {
    /* Algebraically multiply the D register by the A register, producing a
    20-digit product in A and R. All values are BCD with the sign in the 11th digit
    position. If roundOff is truthy, the product in the A register is rounded and
    the R register is cleared. Sets Forbidden-Combination stop as necessary.
    Overflow is not possible */
    var ad;                             // current product (A) digit;
    var am = this.A % 0x10000000000;    // product (A) mantissa
    var aSign = ((this.A - am)/0x10000000000) & 0x01;
    var count = 0;                      // count of word-times consumed
    var dm = this.D % 0x10000000000;    // multiplicand mantissa
    var dSign = ((this.D - dm)/0x10000000000) & 0x01;
    var rc;                             // dup of rd for add counting
    var rd;                             // current multipler (R) digit;
    var rm = am;                        // current multiplier (R) mantissa
    var sign = aSign ^ dSign;           // local copy of sign toggle (sign of product)
    var x;                              // digit counter

    this.togMULDIV = 1;                 // for display only
    this.SHIFT = 0x09;                  // for display only
    this.SHIFTCONTROL = 0x0C;           // for display only
    am = 0;                             // clear the local product (A) mantissa

    // We now have the multiplicand in D (dm), the multiplier in R (rm), and an
    // initial product of zero in A (am). Go through a classic multiply cycle,
    // doing repeated addition based on each multipler digit, and between digits
    // shifting the product (in am and rm) one place to the right. After 10 digits,
    // we're done.

    this.togCOMPL = 0;
    for (x=0; x<10; ++x) {
        rd = rm % 0x10;
        count += rd;
        for (rc=rd; rc>0; --rc) {
            am = this.bcdAdd(am, dm, 0, 0);
        }

        ad = am % 0x10;
        am = (am-ad)/0x10;
        rm = (rm-rd)/0x10 + ad*0x1000000000;
    } // for x

    if (roundOff) {
        ++count;
        if (rm >= 0x5000000000) {
            am = this.bcdAdd(am, 0x01, 0, 0);
        }
        this.R = this.D = 0;
    }

    this.procTime += count*2 + 13;
    this.SPECIAL = 0x09;                // for display only
    this.togSIGN = sign;                // for display only
    this.A = sign*0x10000000000 + am;
    this.R = rm;
    this.D = 0;
};

/**************************************/
D205Processor.prototype.integerDivide = function integerDivide() {
    /* Algebraically divide the A & R registers by the D register, producing a
    signed 10-digit quotient in A and the remainder in R. All values are BCD
    with the sign in the 11th digit position. Sets Forbidden-Combination stop
    as necessary. If the magnitude of the divisor (D) is less or equal to the
    magnitude of the dividend (A), the Overflow stop is set and division
    terminates, unconditionally setting A & R to zero */
    var am = this.A % 0x10000000000;    // current remainder (A) mantissa
    var aSign = ((this.A - am)/0x10000000000) & 0x01;
    var count = 0;                      // count of word-times consumed
    var dm = this.D % 0x10000000000;    // divisor mantissa
    var dSign = ((this.D - dm)/0x10000000000) & 0x01;
    var rd;                             // current quotient (R) digit;
    var rm = this.R;                    // current quotient (R) mantissa
    var sign = aSign ^ dSign;           // local copy of sign toggle (sign of quotient)
    var x;                              // digit counter

    this.togMULDIV = 1;                 // for display only
    this.togDELTABDIV = 1;              // for display only
    this.togDIVALARM = 1;               // for display only
    this.SPECIAL = 0x09;                // for display only: state at end unless overflow is set

    // We now have the divisor in D (dm) and the dividend in A (am) & R (rm).
    // The value in am will become the remainder; the value in rm will become
    // the quotient. Go through a classic long-division cycle, repeatedly
    // subtracting the divisor from the dividend, counting subtractions until
    // underflow occurs, and shifting the divisor left one digit.

    for (x=0; x<10; ++x) {
        // First, shift A & R to the left one digit, with A1 shifting to ASGN
        rd = (rm - rm%0x1000000000)/0x1000000000;
        rm = (rm%0x1000000000)*0x10;
        am = am*0x10 + rd;

        // Now repeatedly subtract D from A until we would get underflow.
        // Unlike the 205, we don't do one subtraction too many.
        rd = 0;
        while (am >= dm && rd < 10) {
            am = this.bcdAdd(dm, am, 1, 1);
            ++rd;
            ++count;
        }

        // Check for overflow (dividend > divisor).
        if (rd < 10) {
            rm += rd;                   // accumulate the quotient digit
            this.togDIVALARM = 0;
        } else {
            this.setOverflow(1);
            this.SPECIAL = 0x0F;        // for display only
            am = rm = 0;
            break;                      // out of for loop
        }
    } // for x

    this.SHIFTCONTROL = 0x0E;           // for display only
    this.SHIFT = 0x09;                  // for display only
    this.togSIGN = sign;                // for display only
    this.togSTEP = 1;                   // for display only
    this.A = sign*0x10000000000 + rm;
    this.R = am;
    this.D = 0;
    if (this.stopOverflow) {
        this.procTime += 24;
    } else {
        this.procTime += count*2 + 52;
    }
};

/**************************************/
D205Processor.prototype.floatingAdd = function floatingAdd() {
    /* Algebraically add the floating-point addend (D) to the floating-point
    augend (A), placing the result in A and clearing D. The R register is not
    affected. All values are BCD with the sign in the 11th digit position.
    The floating exponent is in the first two digit positions, biased by 50.
    Sets the Overflow and Forbidden-Combination stops as necessary */
    var ae;                             // augend exponent (binary)
    var am = this.A % 0x10000000000;    // augend mantissa (BCD)
    var aSign = ((this.A - am)/0x10000000000) & 0x01;
    var compl;                          // complement addition required
    var d;                              // scratch digit;
    var de;                             // addend exponent (binary)
    var dm = this.D % 0x10000000000;    // addend mantissa (BCD)
    var dSign = ((this.D - dm)/0x10000000000) & 0x01;
    var sign = dSign;                   // local copy of sign toggle

    this.togADDER = 1;                  // for display only
    this.togDPCTR = 1;                  // for display only

    ae = (am - am%0x100000000)/0x100000000;
    am %= 0x100000000;
    de = (dm - dm%0x100000000)/0x100000000;
    dm %= 0x100000000;

    // If the exponents are unequal, scale the smaller until they are in
    // alignment, or the scaled mantissa becomes zero.

    // Scale D until its exponent matches or the mantissa goes to zero.
    while (ae > de) {
        if (dm <= 0) {
            de = ae;                // stop scaling
        } else {
            d = dm % 0x10;
            dm = (dm - d)/0x10;     // shift right
            de = this.bcdAdd(1, de, 0, 0);  // ++de
            this.procTime += 2;
        }
    }

    // Scale A until its exponent matches or the mantissa goes to zero.
    while (ae < de) {
        if (am <= 0) {
            ae = de;                // stop scaling
        } else {
            d = am % 0x10;
            am = (am - d)/0x10;     // shift right
            ae = this.bcdAdd(1, ae, 0, 0);  // ++ae
            this.procTime += 2;
        }
    }

    compl = (aSign^dSign);
    am = this.bcdAdd(am, dm, compl, compl);

    // Now examine the resulting sign (still in the adder) to see if we
    // need to recomplement the result.
    if (this.ADDER) {
        // Reverse the sign toggle and recomplement the result (virtually adding to the zeroed dm).
        sign = 1-sign;
        am = this.bcdAdd(am, 0, 1, 1);
        this.procTime += 2;
    }

    // Normalize or scale the result as necessary
    this.SPECIAL = 0;                   // for display only
    if (am >= 0x100000000) {
        // Mantissa overflow: add/subtract can produce at most one digit of
        // overflow, so shift right and increment the exponent, checking for
        // overflow in the exponent.
        if (ae < 0x99) {
            ++this.SPECIAL;             // for display only
            d = am % 0x10;
            am = (am - d)/0x10;         // shift right
            ae = this.bcdAdd(1, ae, 0, 0);      // ++ae
        } else {
            // A scaling shift would overflow the exponent, so set the overflow
            // alarm and leave the mantissa as it was from the add, without the
            // exponent inserted back into it. Since the A register gets reassembled
            // below, we need to set up the mantissa and exponent so the reconstruct
            // will effectively do nothing.
            this.setOverflow(1);
            sign = 0;                   // per 205 FP Handbook
            ae = (am - am%0x100000000)/0x100000000;
            am %= 0x100000000;
        }
    } else if (am > 0) {
        // Normalize the result as necessary
        while (am < 0x10000000) {
            if (ae > 0) {
                ++this.SPECIAL;         // for display only
                am *= 0x10;             // shift left
                ae = this.bcdAdd(1, ae, 1, 1);  // --ae
                this.procTime += 2;
            } else {
                // Exponent underflow: set R and the reconstructed A to zero.
                am = ae = sign = 0;
                this.R = 0;
                break;
            }
        }
    } else {                            // mantissa is zero
        ae = 0;                         // per example in 205 FP Handbook
    }

    // Set toggles for display purposes and set the result.
    this.procTime += 7;                 // total = 7 + 2 if decomplement needed + normalizing shifts
    this.togSIGN = sign;
    this.A = (sign*0x100 + ae)*0x100000000 + am;
    this.D = 0;
};

/**************************************/
D205Processor.prototype.floatingMultiply = function floatingMultiply() {
    /* Algebraically multiply the floating-point multiplicand in the D register
    by the floating-point multiplier in the A register, producing an 18-digit
    product (16 mantissa + 2 exponent) in A and R. All values are BCD with the
    sign in the 11th digit position. The floating exponent is in the first two
    digit positions, biased by 50. Sets the Forbidden-Combination stop as
    necessary */
    var ad;                             // current product (A) digit;
    var ae;                             // product/multiplier (A) exponent
    var am = this.A % 0x10000000000;    // product (A) mantissa
    var aSign = ((this.A - am)/0x10000000000) & 0x01;
    var count = 0;                      // count of word-times consumed
    var de;                             // multiplicand exponent
    var dm = this.D % 0x10000000000;    // multiplicand mantissa
    var dSign = ((this.D - dm)/0x10000000000) & 0x01;
    var rc;                             // dup of rd for add counting
    var rd;                             // current multipler (R) digit;
    var rm;                             // current multiplier (R) mantissa
    var sign = aSign ^ dSign;           // local copy of sign toggle (sign of product)
    var x;                              // digit counter

    this.togMULDIV = 1;                 // for display only
    this.SPECIAL = 0;                   // for display only
    ae = (am - am%0x100000000)/0x100000000;
    am %= 0x100000000;
    de = (dm - dm%0x100000000)/0x100000000;
    dm %= 0x100000000;

    if (am == 0) {
        this.A = this.R = 0;
    } else if (dm == 0) {
        this.A = this.R = 0;
    } else {
        ae = this.bcdAdd(ae, de);
        if (ae >= 0x150) {
            this.setOverflow(1);
            sign = 0;
            this.A = am;
            this.R = 0;
        } else {
            rm = am;                            // move the multiplier to R
            am = 0;                             // clear the local product (A) mantissa
            this.SHIFT = 0x09;                  // for display only
            this.SHIFTCONTROL = 0x0C;           // for display only

            // We now have the multiplicand in D (dm), the multiplier in R (rm), and an
            // initial product of zero in A (am). Go through a classic multiply cycle,
            // doing repeated addition based on each multipler digit, and between digits
            // shifting the product (in am and rm) one place to the right. After 8 digits,
            // we're done, except for normalization.

            this.togCOMPL = 0;
            for (x=0; x<8; ++x) {
                rc = rd = rm % 0x10;
                count += rc;
                while (rc > 0) {
                    am = this.bcdAdd(am, dm, 0, 0);
                    --rc;
                } // while rd

                ad = am % 0x10;
                am = (am-ad)/0x10;
                rm = (rm-rd)/0x10 + ad*0x1000000000;
            } // for x

            // Check for exponent underflow
            if (ae < 0x50) {
                this.A = this.R = 0;    // underflow
            } else {
                // Subtract the exponent bias and normalize the result as necessary.
                ae = this.bcdAdd(0x50, ae, 1, 1);
                while (am < 0x10000000) {
                    if (ae <= 0) {
                        // Exponent underflow: set R and the reconstructed A to zero.
                        am = ae = sign = 0;
                        this.R = 0;
                        break;
                    } else {
                        ++this.SPECIAL;         // for display only
                        rd = (rm - rm%0x1000000000)/0x1000000000;
                        rm = (rm % 0x1000000000)*0x10;
                        am = am*0x10 + rd;      // shift left
                        ae = this.bcdAdd(1, ae, 1, 1);  // --ae
                    }
                }

                this.A = (sign*0x100 + ae)*0x100000000 + am;
                this.R = rm;
            }

            this.procTime += count*2 + 16;
        }
    }

    this.togSIGN = sign;                // for display only
    this.D = 0;
};

/**************************************/
D205Processor.prototype.floatingDivide = function floatingDivide() {
    /* Algebraically divide the 18-digit (16 mantissa + 2 exponent) floating-
    point dividend in the A & R registers by the floating-point divisor in the
    D register, producing a 9- or 10-digit quotient in the A & R registers
    and a 6- or 7-digit remainder in the low-order digits of the R register.
    See the Floating Point Handbook for the gory details of the result format.
    All values are BCD with the sign in the 11th digit position. The floating
    exponent is in the first two digit positions, biased by 50. Sets the
    Forbidden-Combination stop as necessary */
    var ae;                             // dividend/quotient exponent
    var am = this.A % 0x10000000000;    // current remainder (A) mantissa
    var aSign = ((this.A - am)/0x10000000000) & 0x01;
    var count = 0;                      // count of word-times consumed
    var de;                             // divisor exponent
    var dm = this.D % 0x10000000000;    // divisor mantissa
    var dSign = ((this.D - dm)/0x10000000000) & 0x01;
    var rd;                             // current quotient (R) digit;
    var rm = this.R;                    // current quotient (R) mantissa
    var sign = aSign ^ dSign;           // local copy of sign toggle (sign of quotient)
    var x;                              // digit counter

    this.togMULDIV = 1;                 // for display only
    this.togDELTABDIV = 1;              // for display only
    this.togDIVALARM = 0;               // for display only
    this.SPECIAL = 0;                   // for display only
    ae = (am - am%0x100000000)/0x100000000;
    am %= 0x100000000;
    de = (dm - dm%0x100000000)/0x100000000;
    dm %= 0x100000000;

    // Check for zero operands and commence the division
    if (dm == 0) {
        this.A = this.R = sign = 0;     // divide by zero
        this.togDIVALARM = 1;           // for display only
        this.setOverflow(1);
    } else if (am == 0) {
        this.A = this.R = sign = 0;     // dividend is zero so result is zero
    } else {
        // Add the exponent bias to the dividend exponent and check for underflow
        ae = this.bcdAdd(ae, 0x50);
        if (ae < de) {
            // Exponents differ by more than 50 -- underflow
            this.A = this.R = sign = 0;
        } else {
            // If dividend >= divisor, scale the exponent by 1
            if (am >= dm) {
                ae = this.bcdAdd(ae, 1);
            }
            // Subtract the exponents and check for overflow
            ae = this.bcdAdd(de, ae, 1, 1);
            if (ae > 0x99) {
                this.setOverflow(1);
                sign = 0;
                this.A = am;
                this.R = rm;
            } else {
                // We now have the divisor in D (dm) and the dividend in A (am) & R (rm).
                // The value in am will become the remainder; the value in rm will become
                // the quotient. Go through a classic long-division cycle, repeatedly
                // subtracting the divisor from the dividend, counting subtractions until
                // underflow occurs, and shifting the divisor left one digit.

                for (x=0; x<10; ++x) {
                    // Repeatedly subtract D from A until we would get underflow.
                    // Unlike the 205, we don't do one subtraction too many.
                    rd = 0;
                    while (am >= dm) {
                        am = this.bcdAdd(dm, am, 1, 1);
                        ++rd;
                        ++count;
                    }

                    // Shift A & R to the left one digit, accumulating the quotient digit in R
                    rm = rm*0x10 + rd;
                    rd = (rm - rm%0x10000000000)/0x10000000000;
                    rm %= 0x10000000000;
                    if (x < 9) {
                        am = am*0x10 + rd;      // shift into remainder except on last digit
                    }
                } // for x

                // Rotate the quotient from R into A for 8 digits or until it's normalized
                for (x=0; x<8 || am < 0x10000000; ++x) {
                    ++this.SPECIAL;         // for display only
                    rd = (am - am%0x1000000000)/0x1000000000;
                    rm = rm*0x10 + rd;
                    rd = (rm - rm%0x10000000000)/0x10000000000;
                    rm %= 0x10000000000;
                    am = (am%0x10000000)*0x10 + rd;
                    ++count;
                }

                this.SHIFTCONTROL = 0x0E;           // for display only
                this.SHIFT = 0x09;                  // for display only
                this.togSTEP = 1;                   // for display only

                this.A = (sign*0x100 + ae)*0x100000000 + am%0x100000000;
                this.R = rm;
            }

            if (this.stopOverflow) {
                this.procTime += 27;
            } else {
                this.procTime += count*2 + 55;
            }
        }
    }

    this.togSIGN = sign;                // for display only
    this.D = 0;
};


/***********************************************************************
*   Memory Access                                                      *
***********************************************************************/

/**************************************/
D205Processor.prototype.readMemoryFinish = function readMemoryFinish() {
    /* Completes a read of the memory drum after an appropriate delay for drum
    latency. Clears the memory control toggles and calls the current successor
    function. Note: the word has already been stored in D by readMemory() */

    this.scheduler = 0;
    this.stopMemoryTiming();
    this.successor();
};

/**************************************/
D205Processor.prototype.readMemory = function readMemory(successor) {
    /* Initiates a read of the memory drum at the BCD address specified by
    C3-C6. The memory word is placed in the D register, and an appropriate
    delay for drum latency, the successor function is called. Sets the memory
    access toggles as necessary.
    Note: the D register SHOULD be loaded after the latency delay, but we do
    it here so that the word will show on the panels during the drum latency */
    var addr;                           // binary target address, mod 8000
    var cbCategory;                     // setCallback delay-averaging category
    var drumTime =                      // current drum position [word-times]
            performance.now()*D205Processor.wordsPerMilli;
    var latency;                        // drum latency in word-times
    var trackSize;                      // words/track in target band of drum

    addr = D205Processor.bcdBinary(this.CADDR % 0x8000);
    this.memACCESS = 1;
    if (addr < 4000) {
        trackSize = D205Processor.trackSize;
        cbCategory = "MEMM";
        this.memMAIN = this.memLM = 1;
        this.D = this.MM[addr];
    } else {
        trackSize = D205Processor.loopSize;
        cbCategory = "MEML";
        if (addr < 5000) {
            this.memL4 = 1;
            this.D = this.L4[addr%trackSize];
        } else if (addr < 6000) {
            this.memL5 = 1;
            this.D = this.L5[addr%trackSize];
        } else if (addr < 7000) {
            this.memL6 = 1;
            this.D = this.L6[addr%trackSize];
        } else {
            this.memL7 = 1;
            this.D = this.L7[addr%trackSize];
        }
    }

    latency = (addr%trackSize - drumTime%trackSize + trackSize)%trackSize;
    this.startMemoryTiming(drumTime, latency, 1, cbCategory, successor, this.readMemoryFinish);
};

/**************************************/
D205Processor.prototype.writeMemoryFinish = function writeMemoryFinish(clearA) {
    /* Completes a write of the memory drum after an appropriate delay for drum
    latency. A has already been moved to the memory word, so just clears the
    memory control toggles, and calls the current successor function */

    this.scheduler = 0;
    this.stopMemoryTiming();
    if (clearA) {
        this.A = 0;
    }
    this.successor();
};

/**************************************/
D205Processor.prototype.writeMemory = function writeMemory(successor, clearA) {
    /* Initiates a write of the memory drum at the BCD address specified by C3-C6.
    After an appropriate delay for drum latency, the word in A is stored on the drum
    and the successor function is called. Sets the memory access toggles as necessary.
    If clearA is truthy, the A register is cleared at the completion of the write.
    Note: the word should be stored after the latency delay, but we do it here
    so that the word will show in the panels during the drum latency */
    var addr;                           // binary target address, mod 8000
    var cbCategory;                     // setCallback delay-averaging category
    var drumTime =                      // current drum position [word-times]
            performance.now()*D205Processor.wordsPerMilli;
    var latency;                        // drum latency in word-times
    var trackSize;                      // words/track in target band of drum

    addr = D205Processor.bcdBinary(this.CADDR % 0x8000);
    this.memACCESS = 1;
    if (addr < 4000) {
        trackSize = D205Processor.trackSize;
        cbCategory = "MEMM";
        this.memMAIN = this.memLM = this.memRWM = 1;
        this.MM[addr] = this.A;
    } else {
        trackSize = D205Processor.loopSize;
        cbCategory = "MEML";
        this.memRWL = 1;
        if (addr < 5000) {
            this.memL4 = 1;
            this.L4[addr%trackSize] = this.A;
        } else if (addr < 6000) {
            this.memL5 = 1;
            this.L5[addr%trackSize] = this.A;
        } else if (addr < 7000) {
            this.memL6 = 1;
            this.L6[addr%trackSize] = this.A;
        } else {
            this.memL7 = 1;
            this.L7[addr%trackSize] = this.A;
        }
    }

    latency = (addr%trackSize - drumTime%trackSize + trackSize)%trackSize;
    this.startMemoryTiming(drumTime, latency, 1, cbCategory, successor, this.writeMemoryFinish, clearA);
};

/**************************************/
D205Processor.prototype.blockFromLoop = function blockFromLoop(loop, successor) {
    /* Copies 20 words from the designated loop to main memory at the BCD
    address specified by C3-C6. After an appropriate delay for drum latency,
    the successor function is called. Sets the memory access toggles as
    necessary.
    Note: the words SHOULD be copied at the END of the drum latency delay,
    but we do it here, so that the updated registers will show on the panels
    during the delay for drum latency */
    var addr;                           // main binary address, mod 4000
    var drumTime =                      // current drum position [word-times]
            performance.now()*D205Processor.wordsPerMilli;
    var latency;                        // drum latency in word-times
    var loopMem;                        // reference to the loop memory array
    var x;                              // iteration control

    addr = D205Processor.bcdBinary(this.CADDR % 0x4000);
    this.memACCESS = 1;
    this.memMAIN = this.memLM = this.memRWM = this.memWDBL = 1;
    switch (loop) {
    case 4:
        this.memL4 = 1;
        loopMem = this.L4;
        break;
    case 5:
        this.memL5 = 1;
        loopMem = this.L5;
        break;
    case 6:
        this.memL6 = 1;
        loopMem = this.L6;
        break;
    case 7:
        this.memL7 = 1;
        loopMem = this.L7;
        break;
    } // switch loop

    for (x=D205Processor.loopSize; x>0; --x) {
        this.MM[addr] = loopMem[addr%D205Processor.loopSize];
        addr = (addr+1) % 4000;         // handle main memory address wraparound
    }

    /* According to TM4001, the memory control circuits added 200 to the C-register
    address, but only if the blocking operation crossed a main-memory track boundary.
    The Burroughs 205 Handbook of Operating Procedures (Bulletin 2034-A, Rev June 1960),
    however, indicates that for systems equipped with magnetic tape, blocking operations
    added 20 to the address field in C (see paragraph 3-19 on page 3-2). We implement
    the magnetic tape variant */

    this.CADDR = this.bcdAdd(this.CADDR, 0x20)%0x10000;
    this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;

    latency = (addr%D205Processor.trackSize - drumTime%D205Processor.trackSize +
                D205Processor.trackSize)%D205Processor.trackSize;
    this.startMemoryTiming(drumTime, latency, D205Processor.loopSize+2, "MEMM", successor, this.writeMemoryFinish, false);
};

/**************************************/
D205Processor.prototype.blockToLoop = function blockToLoop(loop, successor) {
    /* Copies 20 words from the main memory at the BCD address specified by
    C3-C6 to the designated loop. After an appropriate delay for drum latency,
    the successor function is called. Sets the memory access toggles as
    necessary.
    Note 1: Knuth's MEASY assembler and the Shell assembler both use instructions
    of the form BTn 8000. Normally, this would mean an effective address of 0000,
    but considering the special use of addresses >= 8000 for magnetic tape
    instructions, and the apparent intention of this use in both assemblers,
    we conclude that BTn with the high-order bit of the address set causes 20
    words of zeroes to be written to the designated loop.
    Note 2: the words SHOULD be copied at the END of the drum latency delay,
    but we do it here, so that the updated registers will show on the panels
    during the delay for drum latency */
    var addr;                           // main binary address, mod 4000
    var drumTime =                      // current drum position [word-times]
            performance.now()*D205Processor.wordsPerMilli;
    var latency;                        // drum latency in word-times
    var loopMem;                        // reference to the loop memory array
    var x;                              // iteration control

    addr = D205Processor.bcdBinary(this.CADDR);
    this.memACCESS = 1;
    this.memLM = this.memRWL = this.memWDBL = 1;
    if (addr < 8000) {
        addr %= 4000;
        this.memMAIN = 1;
    }
    switch (loop) {
    case 4:
        this.memL4 = 1;
        loopMem = this.L4;
        break;
    case 5:
        this.memL5 = 1;
        loopMem = this.L5;
        break;
    case 6:
        this.memL6 = 1;
        loopMem = this.L6;
        break;
    case 7:
        this.memL7 = 1;
        loopMem = this.L7;
        break;
    } // switch loop

    if (addr >= 8000) {
        for (x=D205Processor.loopSize; x>0; --x) {
            loopMem[x] = 0;
        }
    } else {
        for (x=D205Processor.loopSize; x>0; --x) {
            loopMem[addr%D205Processor.loopSize] = this.MM[addr];
            addr = (addr+1) % 4000;     // handle main memory address wraparound
        }
    }

    // See the comment on C address field adjustment at this point in blockFromLoop()
    this.CADDR = this.bcdAdd(this.CADDR, 0x20)%0x10000;
    this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;

    latency = (addr%D205Processor.trackSize - drumTime%D205Processor.trackSize +
                D205Processor.trackSize)%D205Processor.trackSize;
    this.startMemoryTiming(drumTime, latency, D205Processor.loopSize+2, "MEMM", successor, this.writeMemoryFinish, false);
};

/**************************************/
D205Processor.prototype.searchMemoryFinish = function searchMemoryFinish() {
    /* Handles completion of a search memory operation and resets the memory
    toggle and timing state */

    this.stopMemoryTiming();
    this.executionComplete();
};

/**************************************/
D205Processor.prototype.searchMemory = function searchMemory(high) {
    /* Searches memory from the current operand address in this.CADDR for a
    word equal to the value in the A register (high=false) or greater than or
    equal to the value in the A register (high=true). Comparisons are based on
    the absolute values of both the word in A and the word in memory, ignoring
    the sign. If a match is found, load the memory word into the A register and
    set the upper 4 digits of R to the memory address where found. If address
    3999 is reached and the word is still not found, terminate with Overflow set.

    This instruction searches one word per word-time, so total execution time is
    drum latency to the initial address plus the number of words searched.
    This function is called after the initial memory word has been fetched into
    the D register by executeWithOperand(), so the latency delay is already
    accounted for. It will proceed to search up to 200 words (one drum track) at
    a time, then if no match is found, perform a catch-up delay. A final partial
    delay is performed at the end of the search.

    Note: the MSH (85) and MSE (88) instructions apparently were a custom
    modification in 1959 for a 205 to be delivered to the Eaton Manufacturing
    Company. A description of these two instructions was found in the back of
    the 205 Central Computer Handbook included with Donald Knuth's papers donated
    to the Computer History Museum in Mountain View, California */
    var addr;                           // main binary address, mod 4000
    var aWord = this.A % 0x10000000000; // search target word
    var drumTime =                      // current drum position [word-times]
            performance.now()*D205Processor.wordsPerMilli;
    var dWord;                          // result of comparison D:A
    var found = false;                  // true if matching word found
    var latency = 0;                    // drum latency on first call, else 0
    var successor = null;               // successor function after drum delay
    var x = 0;                          // iteration control

    addr = D205Processor.bcdBinary(this.CADDR % 0x4000);
    if (!this.memACCESS) {
        this.memACCESS = this.memACTION = this.memMAIN = this.memLM = 1;
        latency = (addr%D205Processor.trackSize - drumTime%D205Processor.trackSize +
                    D205Processor.trackSize)%D205Processor.trackSize;
        this.startMemoryTiming(drumTime, latency, 0, "MEMM", searchMemory, searchMemory, high);
    }

    do {
        dWord = this.bcdAdd(aWord, this.D % 0x10000000000, 1, 1); // effectively abs(D)-abs(A)
        if (dWord == 0) {
            found = true;
            break;                      // out of do loop -- match equal
        } else if (high && dWord < 0x10000000000) {
            found = true;
            break;                      // out of do loop -- match high
        } else if (addr < 3999) {
            this.D = this.MM[++addr];
        } else {
            this.setOverflow(1);
            break;                      // out of do loop -- end of main memory
        }
    } while (++x < D205Processor.trackSize);

    this.CADDR = D205Processor.binaryBCD(addr);
    this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
    if (found) {
        this.A = this.D;
        this.R = this.CADDR*0x1000000 + this.R%0x1000000;
        successor = this.searchMemoryFinish;
    } else if (this.stopOverflow) {
        successor = this.searchMemoryFinish;
    } else {
        successor = searchMemory;
    }

    this.startMemoryTiming(drumTime, latency, x, "MEMM", successor, successor, high);
};


/***********************************************************************
*   Console I/O Module                                                 *
***********************************************************************/

/**************************************/
D205Processor.prototype.consoleOutputSignDigit = function consoleOutputSignDigit() {
    /* Outputs the sign digit for a PTW (03) command and sets up to output the
    first number digit. If the Shift Counter is already at 19, terminates the
    output operation */
    var d;
    var w = this.A % 0x10000000000;

    if (this.togPO1) {                  // if false, we've probably been cleared
        d = (this.A - w)/0x10000000000; // get the digit
        this.A = w*0x10 + d;            // rotate A+sign left one
        if (this.SHIFT == 0x19) {       // if the shift counter is already 19, we're done
            this.togOK = this.togPO1 = 0; // for display only
            this.consoleOutputFinished();
        } else {
            this.togOK = 1-this.togOK;  // for dislay only
            this.togPO2 = 1;            // for display only
            this.togDELAY = 0;          // for display only
            this.console.writeSignDigit(d, this.boundConsoleOutputNumberDigit);
        }
    }
};

/**************************************/
D205Processor.prototype.consoleOutputNumberDigit = function consoleOutputNumberDigit() {
    /* Outputs a numeric digit for a PTW (03) command and sets up to output the
    next number digit. If the Shift Counter is already at 19, terminates the
    output operation and sends a Finish signal */
    var d;
    var w = this.A % 0x10000000000;

    if (this.togPO1) {                  // if false, we've probably been cleared
        this.togOK = 1-this.togOK;      // for dislay only
        this.togPO2 = 1-this.togPO2;    // for display only
        this.togDELAY = 1-this.togDELAY;// for display only
        if (this.SHIFT == 0x19) {       // if the shift counter is already 19, we're done
            d = (this.CADDR - this.CADDR%0x1000)/0x1000;
            this.console.writeFinish(d, this.boundConsoleOutputFinished);
        } else {
            d = (this.A - w)/0x10000000000; // get the digit
            this.A = w*0x10 + d;        // rotate A+sign left one
            this.SHIFT = this.bcdAdd(this.SHIFT, 1);
            this.console.writeNumberDigit(d, this.boundConsoleOutputNumberDigit);
        }
    }
};

/**************************************/
D205Processor.prototype.consoleOutputFinished = function consoleOutputFinished() {
    /* Handles the final cycle of an I/O operation and restores this.procTime */

    if (this.togOK || this.togPO1) {    // if false, we've probably been cleared
        this.togOK = 0;                 // for display only
        this.togPO1 = this.togPO2 = 0;  // for display only
        this.togDELAY = 0;              // for display only
        this.stopIdle = 0;              // turn IDLE lamp back off now that we're done
        this.procTime += performance.now()*D205Processor.wordsPerMilli;
        this.executeComplete();
    }
};

/**************************************/
D205Processor.prototype.consoleRequestDigit = function consoleRequestDigit() {
    /* Solicits the next input digit from the Control Console */

    this.togTF = 0;                     // for display only, reset finish pulse
    this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
    this.console.readDigit(this.boundConsoleReceiveDigit);
};

/**************************************/
D205Processor.prototype.consoleReceiveDigit = function consoleReceiveDigit(digit) {
    /* Handles an input digit coming from the Control Console keyboard or
    paper-tape reader. Negative values indicate a finish pulse; otherwise
    the digit is data read from the device. Data digits are rotated into
    the D register; finish pulses are handled according to the sign digit
    in the D register */
    var sign;                           // register sign digit
    var word;                           // register word less sign

    this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time after I/O
    if (!this.togSTART) {
        // if !START, we've probably been cleared
    } else if (digit >= 0) {
        this.togTC1 = 1-this.togTC1;    // for display only
        this.togTC2 = 1-this.togTC2;    // for display only
        this.D = (this.D % 0x10000000000)*0x10 + digit;
        this.consoleRequestDigit();
    } else {
        this.togTF = 1;
        this.togTC1 = this.togTC2 = 0;  // for display only
        word = this.D%0x10000000000;
        sign = (this.D - word)/0x10000000000; // get D-sign

        if (sign & 0x04) {
            // D-sign is 4, 5, 6, 7: execute a "tape control" command
            this.procTime += 2;
            this.togTF = 0;             // for display only
            this.togSTART = 1-((sign >>> 1) & 0x01); // whether to continue in input mode
            this.setTimingToggle(0);    // Execute mode
            this.togCOUNT = 1;
            this.togBTOAIN = 0;
            this.togADDAB = 1;          // for display only
            this.togADDER = 1;          // for display only
            this.togDPCTR = 1;          // for display only
            this.togCLEAR = 1-(sign & 0x01);
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // display only
            sign &= 0x08;

            // Increment the destination address (except on the first word)
            this.SHIFTCONTROL = 0x01;   // for display only
            this.SHIFT = 0x13;          // for display only
            if (this.togCOUNT) {
                this.CCONTROL = this.bcdAdd(this.CADDR, 1)%0x10000;
            }

            this.CEXTRA = (this.D - word%0x1000000)/0x1000000;
            this.kDigit = (this.CEXTRA >>> 8) & 0x0F;
            // do not set this.selectedUnit from the word -- keep the same unit

            // Shift D5-D10 into C1-C6, modify by B as necessary, and execute
            this.D = sign*0x100000 + (word - word%0x1000000)/0x1000000;
            if (this.togCLEAR) {
                word = this.bcdAdd(word%0x1000000, 0);
            } else {
                word = this.bcdAdd(word%0x1000000, this.B) % 0x1000000;
            }
            this.SHIFT = 0x19;          // for display only
            this.C = word*0x10000 + this.CCONTROL; // put C back together
            this.CADDR = word % 0x10000;
            this.COP = (word - this.CADDR)/0x10000;
            this.execute();
        } else {
            // D-sign is 0, 1, 2, 3: store word, possibly modified by B
            this.procTime += 3;
            this.setTimingToggle(1);    // Fetch mode
            this.togCOUNT = this.togBTOAIN;
            this.togBTOAIN = 1;
            this.togADDAB = 1;          // for display only
            this.togADDER = 1;          // for display only
            this.togDPCTR = 1;          // for display only
            this.togCLEAR = 1-((sign >>> 1) & 0x01);
            this.togSIGN = sign & 0x01;

            // Increment the destination address (except on the first word)
            this.SHIFTCONTROL = 0x01;   // for display only
            this.SHIFT = 0x15;          // for display only
            if (this.togCOUNT) {
                this.CADDR = this.bcdAdd(this.CADDR, 1)%0x10000;
            }
            this.CCONTROL = this.CADDR;
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;

            // Modify the word by B as necessary and store it
            this.D = (sign & 0x0C)*0x10000000000 + word;
            if (this.togCLEAR) {
                this.A = this.bcdAdd(this.D, 0);
            } else {
                this.A = this.bcdAdd(this.D, this.B);
            }

            this.D = 0;
            word = this.A % 0x10000000000;
            sign = (((this.A - word)/0x10000000000) & 0x0E) | (sign & 0x01);
            this.A = sign*0x10000000000 + word;
            this.writeMemory(this.boundConsoleRequestDigit, false);
        }
    }
};

/**************************************/
D205Processor.prototype.consoleReceiveSingleDigit = function consoleReceiveSingleDigit(digit) {
    /* Handles a single input digit coming from the Control Console keyboard
    or paper-tape reader, as in the case of Digit Add (10). Negative values
    indicate a finish pulse, which is ignored, and causes another digit to be
    solicited from the Console; otherwise the digit is (virtually) moved to
    the D register and then (actually) added to the A register */
    var sign;                           // register sign digit
    var word;                           // register word less sign

    if (digit < 0) {                    // ignore finish pulse and just re-solicit
        this.console.readDigit(this.boundConsoleReceiveSingleDigit);
    } else {
        this.procTime += performance.now()*D205Processor.wordsPerMilli + 4; // restore time after I/O
        this.togSTART = 0;
        this.D = digit;
        this.integerAdd();
        this.executeComplete();
    }
};


/***********************************************************************
*   Cardatron I/O Module                                               *
***********************************************************************/

/**************************************/
D205Processor.prototype.cardatronOutputWordReady = function cardatronOutputWordReady() {
    /* Successor function for readMemory that sets up the next word of output
    and calls the current ioCallback function to output that word */

    if (this.tog3IO) {                  // if false, we've probably been cleared
        this.SHIFT = 0x09;              // for display only
        this.A = this.D;                // move D with the memory word to A
        this.togTWA = 1;                // for display only
        this.procTime -= performance.now()*D205Processor.wordsPerMilli;
        this.ioCallback(this.A, this.boundCardatronOutputWord, this.boundCardatronOutputFinished);
    }
};

/**************************************/
D205Processor.prototype.cardatronOutputWord = function cardatronOutputWord(receiver) {
    /* Initiates a read of the next word from memory for output to the
    Cardatron Control Unit */

    this.procTime += performance.now()*D205Processor.wordsPerMilli;
    if (this.tog3IO) {                  // if false, we've probably been cleared
        // Increment the source address (except on the first word)
        this.SHIFTCONTROL = 0x01;       // for display only
        this.SHIFT = 0x15;              // for display only
        if (this.togCOUNT) {
            this.CADDR = this.bcdAdd(this.CADDR, 1)%0x10000;
        } else {
            this.togCOUNT = 1;
        }
        this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
        this.ioCallback = receiver;
        this.readMemory(this.boundCardatronOutputWordReady);
    }
};

/**************************************/
D205Processor.prototype.cardatronOutputFinished = function cardatronOutputFinished() {
    /* Handles the final cycle of an I/O operation and restores this.procTime */

    if (this.tog3IO) {                  // if false, we've probably been cleared
        this.tog3IO = 0;
        this.togTWA = 0;                // for display only
        this.procTime += performance.now()*D205Processor.wordsPerMilli;
        this.executeComplete();
    }
};

/**************************************/
D205Processor.prototype.cardatronInputWord = function cardatronInputWord() {
    // Solicits the next input word from the Cardatron Control Unit */

    this.togTF = 0;                     // for display only, reset finish pulse
    this.togTWA = 1;                    // for display only
    this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
    this.cardatron.inputWord(this.selectedUnit, this.boundCardatronReceiveWord);
};

/**************************************/
D205Processor.prototype.cardatronReceiveWord = function cardatronReceiveWord(word) {
    /* Handles a word coming from the Cardatron input unit. Negative values for
    the word indicate the last word was previously sent and the I/O is finished.
    The word is stored into the D register and is handled according to the sign
    digit in the D register. Any partial word received at the end of the
    I/O is abandoned */
    var sign;                           // D-register sign digit

    this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time after I/O
    if (word < 0) {
        // Last word received -- finished with the I/O
        this.tog3IO = 0;
        this.togSTART = 0;
        this.togTF = 0;                 // for display only
        this.togTWA = 0;                // for display only
        this.D = word-0x900000000000;   // remove the finished signal; for display only, not stored
        this.executeComplete();
    } else {
        // Full word accumulated -- process it and initialize for the next word
        this.SHIFT = 0x19;              // for display only
        this.togTF = 1;                 // for display only
        this.D = word;
        word %= 0x10000000000;          // strip the sign digit
        sign = (this.D - word)/0x10000000000; // get D-sign

        if (sign & 0x04) {
            // D-sign is 4, 5, 6, 7: execute the word as an instruction
            this.procTime += 2;
            this.togTF = 0;             // for display only
            this.togSTART = 1-((sign >>> 1) & 0x01); // whether to continue in input mode
            this.setTimingToggle(0);    // Execute mode
            this.togCOUNT = 0;
            this.togBTOAIN = 0;
            this.togADDAB = 1;          // for display only
            this.togADDER = 1;          // for display only
            this.togDPCTR = 1;          // for display only
            this.togCLEAR = ((this.kDigit & 0x08) ? 1 : 1-(sign & 0x01));
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // display only

            this.CEXTRA = (this.D - word%0x1000000)/0x1000000;
            this.kDigit = (this.CEXTRA >>> 8) & 0x0F;
            // do not set this.selectedUnit from the word -- keep the same unit

            // Shift D5-D10 into C1-C6, modify by B as necessary, and execute
            if (this.togCLEAR) {
                word = this.bcdAdd(word%0x1000000, 0);
            } else {
                word = this.bcdAdd(word%0x1000000, this.B) % 0x1000000;
            }
            this.C = word*0x10000 + this.CCONTROL; // put C back together
            this.CADDR = word % 0x10000;
            this.COP = (word - this.CADDR)/0x10000;
            if (sign & 0x02) {          // sign-6 or -7
                this.tog3IO = 0;
                this.togTF = 0;         // for display only
                this.cardatron.inputStop(this.selectedUnit);
                this.execute();
            } else {                    // sign-4 or -5
                /* It's not exactly clear what should happen at this point. The
                documentation states that a sign-4 or -5 word coming from a Cardatron
                input unit can only contain a CDR (44) instruction, which is sensible,
                since sign-4/5 words are generally used to change the destination memory
                address for the data transfer, and the Cardatron presumably still had
                words to transfer. What it doesn't say is what happened if the sign-4/5
                word contained something else. My guess is that either the Processor
                ignored any other op code and proceeded as if it had been a CDR, or more
                likely, things went to hell in a handbasket. The latter is a little
                difficult to emulate, especially since we don't know which hell or
                handbasket might be involved, so we'll assume the former, and just
                continue requesting words from the Cardatron */
                this.SHIFT = 0x09;      // reset shift counter for next word
                this.D = 0;             // clear D to prepare for next word
                this.cardatronInputWord(); // request the next word
            }
        } else {
            // D-sign is 0, 1, 2, 3, 8, 9: store word, possibly modified by B
            this.procTime += 3;
            this.setTimingToggle(1);    // Fetch mode
            this.togCOUNT = this.togBTOAIN;
            this.togBTOAIN = 1;
            this.togADDAB = 1;          // for display only
            this.togADDER = 1;          // for display only
            this.togDPCTR = 1;          // for display only
            this.togSIGN = sign & 0x01;
            if (this.kDigit & 0x08) {
                this.togCLEAR = 1;
            } else {
                this.togCLEAR = 1-((sign >>> 1) & 0x01);
                sign &= 0x0D;
            }

            // Increment the destination address (except on the first word)
            this.SHIFTCONTROL = 0x01;   // for display only
            this.SHIFT = 0x15;          // for display only
            if (this.togCOUNT) {
                this.CADDR = this.bcdAdd(this.CADDR, 1)%0x10000;
            }
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;

            // Modify the word by B as necessary and store it
            if (this.togCLEAR) {
                word = this.bcdAdd(word, 0);
            } else {
                word = this.bcdAdd(word, this.B);
            }

            this.A = sign*0x10000000000 + word%0x10000000000;
            this.SHIFT = 0x09;          // reset shift counter for next word
            this.D = 0;                 // clear D and request the next word after storing this one
            this.writeMemory(this.boundCardatronInputWord, false);
        }
    }
};


/***********************************************************************
*   Magnetic Tape I/O Module                                           *
***********************************************************************/

/**************************************/
D205Processor.prototype.magTapeInitiateSend = function magTapeInitiateSend(writeInitiate) {
    /* Performs the initial memory block-to-loop operation after the tape control
    unit has determined the drive is ready and not busy. Once the initial loop is
    loaded, calls "writeInitiate" to start tape motion, which in turn will cause
    the control to call this.magTapeSendBlock to pass the loop data to the drive
    and initiate loading of the alternate loop buffer */
    var that = this;

    if (this.togMT3P) {                 // if false, we've probably been cleared
        if (this.CADDR >= 0x8000) {
            writeInitiate(this.boundMagTapeSendBlock, this.boundMagTapeTerminateSend);
        } else {
            this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time after I/O
            this.blockToLoop((this.togMT1BV4 ? 4 : 5), function initialBlockComplete() {
                that.procTime -= performance.now()*D205Processor.wordsPerMilli; // suspend time during I/O
                writeInitiate(that.boundMagTapeSendBlock, that.boundMagTapeTerminateSend);
            });
        }
    }
};

/**************************************/
D205Processor.prototype.magTapeSendBlock = function magTapeSendBlock(block, lastBlock) {
    /* Sends a block of data from a loop buffer to the tape control unit and
    initiates the load of the alternate loop buffer. this.togMT1BV4 and
    this.togMT1BV5 control alternation of the loop buffers. "block" is the tape
    control's buffer; "lastBlock" indicates this will be the last block
    requested by the control unit and no further blocks should be buffered. If
    the C-register address is 8000 or higher, the loop is not loaded from main
    memory, and the current contents of the loop are written to tape. Since tape
    block writes take 46 ms, they are much longer than any memory-to-loop
    transfer, so this routine simply exits after the next blockToLoop is
    initiated, and the processor then waits for the tape control unit to request
    the next block, by which time the blockToLoop will have completed. Returns
    true if the processor has been cleared and the I/O must be aborted */
    var aborted = false;
    var loop;
    var loopOffset = D205Processor.bcdBinary(this.CADDR)%D205Processor.loopSize;
    var that = this;
    var x;

    function blockFetchComplete() {
        that.procTime -= performance.now()*D205Processor.wordsPerMilli; // suspend time again during I/O
    }

    //console.log("TSU " + this.selectedUnit + " W, L" + (this.togMT1BV4 ? 4 : 5) +
    //        ", ADDR=" + this.CADDR.toString(16) +
    //        " : " + block[0].toString(16) + ", " + block[19].toString(16));

    if (!this.togMT3P) {
        aborted = true;
    } else {
        // Select the appropriate loop to send data to the drive
        if (this.togMT1BV4) {
            loop = this.L4;
            this.toggleGlow.glowL4 = 1; // turn on the lamp and let normal decay work
        } else {
            loop = this.L5;
            this.toggleGlow.glowL5 = 1;
        }

        // Copy the loop data to the tape control's buffer, adjusting for the mod-20 address
        for (x=D205Processor.loopSize-1; x>=0; --x) {
            block[x] = loop[(x+loopOffset)%D205Processor.loopSize];
        }

        // Flip the buffer toggles and request the next block from memory
        if (!lastBlock) {
            this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time after I/O
            this.togMT1BV5 = this.togMT1BV4;
            this.togMT1BV4 = 1-this.togMT1BV4;
            // Block the loop buffer from main memory if appropriate
            if (this.CADDR < 0x8000) {
                this.blockToLoop((this.togMT1BV4 ? 4 : 5), blockFetchComplete);
            } else {
                blockFetchComplete();
            }
        }

        this.A = block[loop.length-1];  // for display only
        this.D = 0;                     // for display only
    }

    return aborted;                     // give the loop data to the control unit
};

/**************************************/
D205Processor.prototype.magTapeTerminateSend = function magTapeTerminateSend() {
    /* Called by the tape control unit after the last block has been completely
    written to tape. Terminates the write instruction */

    if (this.togMT3P) {                 // if false, we've probably been cleared
        this.togMT3P = 0;
        this.togMT1BV4 = this.togMT1BV5 = 0;
        this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time after I/O
        this.executeComplete();
    }
};

/**************************************/
D205Processor.prototype.magTapeReceiveBlock = function magTapeReceiveBlock(block, lastBlock) {
    /* Called by the tape control unit to store a block of 20 words. If "lastBlock" is
    true, it indicates this is the last block and the I/O is finished. If "block"
    is null, that indicates the I/O was aborted and the block must not be stored
    in memory. The block is stored in one of the loops, as determined by the
    togMT1BV4 and togMT1BV5 control toggles. Sign digit adjustment and B-register
    modification take place at this time. If the C-register operand address is
    less than 8000, the loop is then stored at the current operand address, which
    is incremented by blockFromLoop(). If this is the last block, executeComplete()
    is called after the loop is stored to terminate the read instruction. Since
    tape block reads take 46 ms, they are much longer than any loop-to-memory
    transfer, so this routine simply exits after the blockFromLoop is initiated,
    and the then processor waits for the next block to arrive from the tape, by
    which time the blockFromLoop will (should?) have completed. Returns true if
    the processor has been cleared and the tape control unit should abort the I/O */
    var aborted = false;                // return value
    var loop;
    var loopOffset = D205Processor.bcdBinary(this.CADDR)%D205Processor.loopSize;
    var sign;                           // sign digit
    var that = this;
    var w;                              // scratch word
    var x;                              // scratch index

    function blockStoreComplete() {
        if (lastBlock) {
            if (that.togMT3P) {         // if false, we've probably been cleared
                that.A = that.D = 0;    // for display only
                that.togMT3P = 0;
                that.togMT1BV4 = that.togMT1BV5 = 0;
                that.executeComplete();
            }
        } else {
            // Flip the loop buffer toggles
            that.togMT1BV5 = that.togMT1BV4;
            that.togMT1BV4 = 1-that.togMT1BV4;
            // Suspend time again during I/O
            that.procTime -= performance.now()*D205Processor.wordsPerMilli;
        }
    }

    //console.log("TSU " + this.selectedUnit + " R, L" + (this.togMT1BV4 ? 4 : 5) +
    //        ", ADDR=" + this.CADDR.toString(16) +
    //        " : " + block[0].toString(16) + ", " + block[19].toString(16));

    if (!this.togMT3P) {                // if false, we've probably been cleared
        aborted = true;
    } else {
        this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time after I/O
        // Select the appropriate loop to receive data from the drive
        if (this.togMT1BV4) {
            loop = this.L4;
            this.toggleGlow.glowL4 = 1; // turn on the lamp and let normal decay work
        } else {
            loop = this.L5;
            this.toggleGlow.glowL5 = 1;
        }

        if (!block) {                   // control unit aborted the I/O
            blockStoreComplete();
        } else {
            // Copy the tape block data to the appropriate high-speed loop
            for (x=0; x<D205Processor.loopSize; ++x) {
                w = block[x];
                if (w < 0x20000000000) {
                    this.togCLEAR = 1;  // no B modification
                } else {
                    // Adjust sign digit and do B modification as necessary
                    sign = ((w - w%0x10000000000)/0x10000000000) % 0x08; // low-order 3 bits only
                    if (this.tswSuppressB) {
                        this.togCLEAR = 1;  // no B modification
                    } else {
                        this.togCLEAR = ((sign & 0x02) ? 0 : 1);
                        sign &= 0x01;
                    }

                    w = sign*0x10000000000 + w%0x10000000000;
                }

                if (this.togCLEAR) {
                    w = this.bcdAdd(w, 0);
                } else {
                    w = this.bcdAdd(w, this.B);
                }

                loop[(x+loopOffset)%D205Processor.loopSize] = w;
            } // for x

            this.D = w;                 // last word, for display only
            this.A = w;                 // for display only

            // Block the loop buffer to main memory if appropriate
            if (this.CADDR < 0x8000) {
                this.blockFromLoop((this.togMT1BV4 ? 4 : 5), blockStoreComplete);
            } else {
                blockStoreComplete();
            }
        }
    }

    return aborted;
};


/***********************************************************************
*   External Control Module                                            *
***********************************************************************/

/**************************************/
D205Processor.prototype.setExternalSwitches = function setExternalSwitches() {
    /* Sets the eight external switches from the most-significant digits of
    the D register. If the memory operand word is negative, sets a break-
    point stop at the end of the instruction, per Bulletin 3031 */
    var d;                              // current D-register digit
    var w = this.D % 0x10000000000;     // working copy of D word
    var x;                              // digit index

    if (this.D % 0x20000000000 >= 0x10000000000) {
        this.togBKPT = 1;
    }

    for (x=7; x>=0; --x) {
        d = (w - w%0x1000000000)/0x1000000000;
        w = (w%0x1000000000)*0x10;
        switch (d%0x04) {
        case 1:                         // open the switch
            this.externalSwitch[x] = 0;
            break;
        case 2:                         // close the switch
            this.externalSwitch[x] = 1;
            break;
        case 3:                         // complement the switch
            this.externalSwitch[x] = 1 - (this.externalSwitch[x] % 0x01);
            break;
        // default: leave switch unchanged
        } // switch
    } // for x
};


/***********************************************************************
*   Fetch Module                                                       *
***********************************************************************/

/**************************************/
D205Processor.prototype.transferDtoC = function transferDtoC() {
    /* Implements the D-to-C portion of the fetch cycle. Shifts the operand
    address in C3-C6 to C7-C10, incrementing that address by one. Shifts the
    low-order six digits of D into C1-C6, applying B register modification if
    the D sign bit is 1. Leaves D shifted six digits to the right.
    Note that during B modification, overflow may occur from the operand address
    into the opcode digits coming from D, which on the 205 could be either a
    feature or a bug, depending on how well you were paying attention */
    var addr = this.C % 0x100000000;    // operand address digits from C
    var ctl = addr % 0x10000;           // control address digits from C

    this.SHIFTCONTROL = 0x07;           // for display only
    this.togADDAB = 1;                  // for display only
    this.togCLEAR =                     // determine D sign for B modification
            1-(((this.D - this.D%0x10000000000)/0x10000000000) & 0x01);

    addr = (addr-ctl)/0x10000;                          // extract the actual address digits
    this.CCONTROL = this.bcdAdd(addr, 0x0001) % 0x10000;// bump the control address modulo 10000

    addr = this.D % 0x1000000;                          // get the opcode and address digits from D
    this.CEXTRA = this.D = (this.D - addr)/0x1000000;   // shift D right six digits & save what's left
    if (this.togCLEAR) {                                // check for B modification
        addr = this.bcdAdd(addr, 0);                    // if no B mod, add 0 (this is actually the way it worked)
    } else {
        addr = this.bcdAdd(addr, this.B) % 0x1000000;   // otherwise, add B to the operand address
    }

    this.SHIFT = 0x19;                                  // for display only
    this.C = addr*0x10000 + this.CCONTROL;              // put C back together
    this.CADDR = addr % 0x10000;
    this.COP = (addr - this.CADDR)/0x10000;
};

/**************************************/
D205Processor.prototype.fetchComplete = function fetchComplete() {
    /* Second phase of the Fetch cycle, called after the word is read from
    memory into D */
    var breakDigit;                     // breakpoint digit from D4

    this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01;
    this.transferDtoC();
    this.procTime += 4;                 // minimum alpha for all orders is 4
    breakDigit = this.CEXTRA % 0x10;
    if (this.cswBreakpoint & breakDigit) { // check for breakpoint stop
        this.togBKPT = 1;               // prepare to halt after this instruction
    }

    if (this.cswSkip && (breakDigit & 0x08)) {
        if (!this.sswLockNormal) {
            this.setTimingToggle(1);    // stay in Fetch to skip this instruction
        }
        if (this.togBKPT) {
            this.togCST = 1;            // halt the processor (breakpoint digit=9)
        }
    }

    //>>>> DEBUG <<<<
    //console.log("Fetch Compl " + this.C.toString(16) + " " + performance.now());

    // If we're not halted and either console has started in Continuous mode, continue
    if (this.togCST || !(this.sswStepContinuous || this.cctContinuous)) {
        this.stop();
    } else if (this.togTiming) {
        this.fetch();                   // once more with feeling
    } else {
        this.execute();                 // execute the instruction just fetched
    }
};

/**************************************/
D205Processor.prototype.fetch = function fetch() {
    /* Implements the Fetch cycle of the 205 processor. This is initiated either
    by pressing START on one of the consoles with the Timing Toggle=1 (Fetch),
    or by the prior Operation Complete if the processor is in continuous mode */

    //>>>> DEBUG <<<<
    //console.log("Fetch Start " + this.C.toString(16) + " " + performance.now());

    this.CADDR = this.C % 0x100000000;  // C operand and control addresses
    this.CCONTROL = this.CADDR % 0x10000; // C control address
    this.COP = (this.C - this.CADDR)/0x100000000; // C operation code
    this.CADDR = (this.CADDR - this.CCONTROL)/0x10000;

    this.togT0 = 0;                     // for display only, leave it off for fetch cycle
    if (this.togSTART) {
        if (this.tog3IO) {
            this.cardatronInputWord(); // we're still executing a Cardatron input command
        } else {
            this.consoleRequestDigit();   // we're still executing a Console input command
        }
    } else {
        this.setTimingToggle(0);        // next cycle will be Execute by default
        this.SHIFT = 0x15;              // for display only
        this.SHIFTCONTROL = 0x05;       // for display only
        // shift control address into operand address and initiate read
        this.CADDR = this.CCONTROL;
        this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
        this.readMemory(this.fetchComplete);  // load D from the operand address
    }
};


/***********************************************************************
*   Execute Module                                                     *
***********************************************************************/

/**************************************/
D205Processor.prototype.executeComplete = function executeComplete() {
    /* Implements Operation Complete (O.C.) for the Execute cycle. Determines
    if there is a stop or alarm condition, otherwise determines whether to
    do a Fetch or Execute cycle next. We should clear the control toggles here,
    but leave them so they'll display during the fetch latency delay. They
    will be cleared in the next call to execute() */

    if (this.togBKPT) {
        this.togCST = 1;
        this.stopBreakpoint = 1;        // turn on BKPT lamp
    }

    if (this.togCST) {
        this.stop();
    } else if (!(this.sswStepContinuous || this.cctContinuous)) {
        this.stop();
    } else if (this.togTiming) {
        this.fetch();                   // once more with feeling
    } else {
        this.execute();                 // execute the instruction currently in C
    }
};

/**************************************/
D205Processor.prototype.executeWithOperand = function executeWithOperand() {
    /* Executes an instruction that requires an operand, after that operand
    has been read from memory into the D register */

    ++this.procTime;                    // minimum alpha for Class II ops is 5 word-times
    switch (this.COP) {
    case 0x60:          //---------------- M    Multiply
        this.integerMultiply(false);
        break;

    case 0x61:          //---------------- Div  Divide
        this.integerDivide();
        break;

    // 0x62:            //---------------- (no op)
        break;

    case 0x63:          //---------------- EX   Extract
        this.integerExtract();
        break;

    case 0x64:          //---------------- CAD  Clear and Add A
        this.procTime += 6;
        this.A = this.bcdAdd(0, this.D);
        this.D = 0;
        break;

    case 0x65:          //---------------- CSU  Clear and Subtract A
        this.procTime += 6;
        // Complement the D sign -- any sign overflow will be ignored by integerAdd
        this.A = this.bcdAdd(0, D205Processor.bitFlip(this.D, 40));
        this.D = 0;
        break;

    case 0x66:          //---------------- CADA Clear and Add Absolute
        this.procTime += 6;
        this.A = this.bcdAdd(0, D205Processor.bitReset(this.D, 40));
        this.D = 0;
        break;

    case 0x67:          //---------------- CSUA Clear and Subtract Absolute
        this.procTime += 6;
        this.A = this.bcdAdd(0, D205Processor.bitSet(this.D, 40));
        this.D = 0;
        break;

    // 0x68-0x69:       //---------------- (no op)

    case 0x70:          //---------------- MRO  Multiply and Round
        this.integerMultiply(true);
        break;

    case 0x71:          //---------------- EXC  External Control
        this.setExternalSwitches();
        break;

    case 0x72:          //---------------- SB   Set B
        this.procTime += 6;
        this.SHIFT = 0x15;                              // for display only
        this.SHIFTCONTROL = 0;                          // for display only
        this.togADDAB = 1;                              // for display only
        this.togCLEAR = 1;                              // for display only
        this.DELTABDIVT = 1;                            // for display only
        this.B = this.bcdAdd(0, this.D % 0x10000);
        this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // for display only
        this.D = 0;
        break;

    case 0x73:          //---------------- OSGD Overflow on Sign Difference
        this.procTime += 5;
        this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // for display, mostly
        this.setOverflow(this.togSIGN ^
                (((this.D - this.D%0x10000000000)/0x10000000000) & 0x01));
        this.D = 0;
        break;

    case 0x74:          //---------------- AD   Add
        this.integerAdd();
        break;

    case 0x75:          //---------------- SU   Subtract
        this.D = D205Processor.bitFlip(this.D, 40);              // complement the D sign
        this.integerAdd();
        break;

    case 0x76:          //---------------- ADA  Add Absolute
        this.D = D205Processor.bitReset(this.D, 40);             // clear the D sign
        this.integerAdd();
        break;

    case 0x77:          //---------------- SUA  Subtract Absolute
        this.D = D205Processor.bitSet(this.D, 40);      // set the D sign
        this.integerAdd();
        break;

    // 0x78-0x79:       //---------------- (no op)

    case 0x80:          //---------------- FAD  Floating Add
        this.floatingAdd();
        break;

    case 0x81:          //---------------- FSU  Floating Subtract
        // Complement the D sign -- any sign overflow will be ignored by floatingAdd.
        this.D += 0x10000000000;
        this.floatingAdd();
        break;

    case 0x82:          //---------------- FM   Floating Multiply
        this.floatingMultiply();
        break;

    case 0x83:          //---------------- FDIV Floating Divide
        this.floatingDivide();
        break;

    // 0x84:            //---------------- (no op)

    case 0x85:          //---------------- MSH  Memory Search High (Eaton CER)
        this.searchMemory(true);
        return;                         // avoid the executeComplete()
        break;

    // 0x86:            //---------------- (no op)

    case 0x87:          //---------------- MSE  Memory Search Equal (Eaton CER)
        this.searchMemory(false);
        return;                         // avoid the executeComplete()
        break;

    // 0x88-0x89:       //---------------- (no op)

    case 0x90:          //---------------- FAA  Floating Add Absolute
        this.D %= 0x10000000000;        // clear the D-sign digit
        this.floatingAdd();
        break;

    case 0x91:          //---------------- FSA  Floating Subtract Absolute
        this.D = this.D%0x10000000000 + 0x10000000000; // set the D-sign
        this.floatingAdd();
        break;

    case 0x92:          //---------------- FMA  Floating Multiply Absolute
        this.D %= 0x10000000000;        // clear the D-sign digit
        this.floatingMultiply();
        break;

    case 0x93:          //---------------- FDA  Floating Divide Absolute
        this.D %= 0x10000000000;        // clear the D-sign digit
        this.floatingDivide();
        break;

    // 0x94-0x99:       //---------------- (no op)

    } // switch this.COP

    this.executeComplete();
};

/**************************************/
D205Processor.prototype.execute = function execute() {
    /* Implements the Execute cycle of the 205 processor. This is initiated either
    by pressing START on one of the consoles with the Timing Toggle=0 (Execute),
    or by the prior operation complete if the processor is in continuous mode */
    var d;                              // scratch digit
    var w;                              // scratch word
    var x;                              // scratch variable or counter

    w = this.C % 0x100000000;           // C register operand and control addresses
    this.CCONTROL = w % 0x10000;        // C register control address
    this.COP = (this.C - w)/0x100000000; // C register operation code
    this.CADDR = (w - this.CCONTROL)/0x10000; // C register operand address

    this.togZCT = 0;                    // for display only
    this.togT0 = 1;                     // for display only, leave it on for execute cycle
    if (!this.sswLockNormal) {
        this.setTimingToggle(1);        // next cycle will be Fetch by default
    }

    if ((this.COP & 0xF8) == 0x08) {    // if STOP (08) operator or
        this.togCST = 1;                        // halt the processor
        this.stopControl = 1;                   // turn on CONTROL lamp
        this.executeComplete();
    } else if (this.stopOverflow && (this.COP & 0x08) == 0) {  // overflow and op is not a CC
        this.togCST = 1;                        // halt the processor
        this.stopControl = 1;                   // turn on CONTROL lamp
        this.executeComplete();
    } else if (this.COP >= 0x60) {      // if operator requires an operand
        this.clearControlToggles();
        this.readMemory(this.executeWithOperand);
    } else {                            // otherwise execute a non-operand instruction
        this.clearControlToggles();
        this.procTime += 4;                     // minimum Class I execution is 4 word-times

        switch (this.COP) {
        case 0x00:      //---------------- PTR  Paper-tape/keyboard read
            this.D = 0;
            this.togSTART = 1;
            this.consoleRequestDigit();
            break;

        case 0x01:      //---------------- CIRA Circulate A
            x = D205Processor.bcdBinary(this.CADDR % 0x20);
            this.procTime += x+5;
            x = 19-x;
            this.SHIFT = D205Processor.binaryBCD(x);    // for display only
            this.togDELAY = 1;                          // for display only
            w = this.A;
            for (; x<=19; ++x) {
                d = (w - w%0x10000000000)/0x10000000000;
                w = (w%0x10000000000)*0x10 + d;
            }
            this.A = w;
            this.executeComplete();
            break;

        case 0x02:      //---------------- STC  Store and Clear A
            this.writeMemory(this.executeComplete, true);
            break;

        case 0x03:      //---------------- PTW  Paper-tape/Flexowriter write
            if (this.cswPOSuppress) {
                this.executeComplete();                 // ignore printout commands
            } else if (this.cswOutput == 0) {
                this.togCST = 1;                        // halt if Output switch is OFF
                this.executeComplete();
            } else {
                this.togPO1 = 1;                        // for display only
                this.SHIFT = this.bcdAdd(this.CADDR%0x20, 0x19, 1, 1);  // 19-n
                this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
                this.stopIdle = 1;                      // turn IDLE lamp on in case Output Knob is OFF
                d = (this.CADDR%0x1000 - this.CADDR%0x100)/0x100;
                if (d) {                                // if C8 is not zero, output it first as the format digit
                    this.togOK = this.togDELAY = 1;     // for display only
                    this.console.writeFormatDigit(d, this.boundConsoleOutputSignDigit);
                } else {
                    this.consoleOutputSignDigit();
                }
            }
            break;

        case 0x04:      //---------------- CNZ  Change on Non-Zero
            this.procTime += 5;
            this.togZCT = 1;                            // for display only
            this.D = 0;
            this.integerAdd();                          // clears the sign digit, among other things
            if (this.A) {
                this.setTimingToggle(0);                // stay in Execute
                this.setOverflow(1);                    // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        // 0x05:        //---------------- (no op)

        case 0x06:      //---------------- UA   Unit Adjust
            if (this.A % 2 == 0) {
                ++this.A;
            }
            this.executeComplete();
            break;

        case 0x07:      //---------------- PTWF Paper-tape Write Format
            if (this.cswPOSuppress) {
                this.executeComplete();                 // ignore printout commands
            } else if (this.cswOutput == 0) {
                this.togCST = 1;                        // halt if Output switch is OFF
                this.executeComplete();
            } else {
                this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
                this.stopIdle = 1;                      // turn IDLE lamp on in case Output Knob is OFF
                d = (this.CADDR%0x1000 - this.CADDR%0x100)/0x100;
                if (d) {                                // if C8 is not zero, output it as the format digit
                    this.togOK = this.togDELAY = 1;
                    this.console.writeFormatDigit(d, this.boundConsoleOutputFinished);
                } else {
                    this.consoleOutputFinished();
                }
            }
            break;

        // 0x08:        //---------------- HALT [was handled above]

        // 0x09:        //---------------- (no op)

        case 0x10:      //---------------- DAD  Digit Add from keyboard to A
            this.togSTART = 1;
            this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
            this.console.readDigit(this.boundConsoleReceiveSingleDigit);
            break;

        case 0x11:      //---------------- BA   B to A transfer
            this.procTime += 3;
            this.togBTOAIN = 1;                         // for display only
            this.togADDAB = 1;                          // for display only
            this.togDELTABDIV = 1;                      // for display only
            this.SHIFT = 0x15;                          // for display only
            this.A = this.bcdAdd(0, this.B);
            this.executeComplete();
            break;

        case 0x12:      //---------------- ST   Store A
            this.writeMemory(this.executeComplete, false);
            break;

        case 0x13:      //---------------- SR   Shift Right A & R
            x = D205Processor.bcdBinary(this.CADDR % 0x20);
            this.procTime += (x < 12 ? 2 : 3);
            x = 19-x;
            this.SHIFT = D205Processor.binaryBCD(x);    // for display only
            this.SHIFTCONTROL = 0x04;                   // for display only
            w = this.A % 0x10000000000;                 // A sign is not affected
            for (; x<19; ++x) {
                d = w % 0x10;
                w = (w-d)/0x10;
                this.R = (this.R - this.R % 0x10)/0x10 + d*0x1000000000;
            }
            this.A += w - this.A%0x10000000000;         // restore the sign
            this.executeComplete();
            break;

        case 0x14:      //---------------- SL   Shift Left A & R
            x = D205Processor.bcdBinary(this.CADDR % 0x20);
            this.procTime += (x < 9 ? 3 : 2);
            this.SHIFT = D205Processor.binaryBCD(x);    // for display only
            this.SHIFTCONTROL = 0x06;                   // for display only
            w = this.A % 0x10000000000;                 // A sign is not affected
            for (; x<=19; ++x) {
                d = this.R % 0x10;
                this.R = (this.R - d)/0x10;
                d = (w += d*0x10000000000)%0x10;
                w = (w-d)/0x10;
                this.R += d*0x1000000000;
            }
            this.A += w - this.A%0x10000000000;         // restore the sign
            this.executeComplete();
            break;

        case 0x15:      //---------------- NOR  Normalize A & R
            this.togZCT = 1;                            // for display only
            this.SHIFTCONTROL = 0x02;                   // for display only
            w = this.A % 0x10000000000;                 // A sign is not affected
            x = 0;
            do {
                d = (w - w%0x1000000000)/0x1000000000;
                if (d) {
                    break;                              // out of do loop
                } else {
                    ++x;                                // count the shifts
                    d = this.R % 0x1000000000;          // shift A and R left
                    w = w*0x10 + (this.R - d)/0x1000000000;
                    this.R = d*0x10;
                }
            } while (x < 10);
            this.A += w - this.A%0x10000000000;         // restore the sign
            this.procTime += x*2 + 8;

            this.SPECIAL = x;                           // the result
            this.SHIFTCONTROL |= 0x04;                  // for display only
            this.SHIFT = 0x19;                          // for display only
            if (x < 10) {
            } else {
                this.setTimingToggle(0);                // stay in Execute
                this.setOverflow(1);                    // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        case 0x16:      //---------------- ADSC Add Special Counter to A
            this.D = this.SPECIAL;
            this.integerAdd();
            this.executeComplete();
            break;

        case 0x17:      //---------------- SUSC Subtract Special Counter from A
            this.D = this.SPECIAL + 0x10000000000;      // set to negative
            this.integerAdd();
            this.executeComplete();
            break;

        // 0x18-0x19:   //---------------- (no op)

        case 0x20:      //---------------- CU   Change Unconditionally
            this.procTime += 4;
            this.SHIFT = 0x15;                          // for display only
            this.SHIFTCONTROL = 0x07;                   // for display only
            this.CCONTROL = this.CADDR;                 // copy address to control counter
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.executeComplete();
            break;

        case 0x21:      //---------------- CUR  Change Unconditionally, Record
            this.procTime += 4;
            this.SHIFT = 0x15;                          // for display only
            this.SHIFTCONTROL = 0x07;                   // for display only
            this.R = this.CCONTROL*0x1000000;           // save current control counter
            this.CCONTROL = this.CADDR;                 // copy address to control counter
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.executeComplete();
            break;

        case 0x22:      //---------------- DB   Decrease B and Change on Negative
            this.procTime += 5;
            this.togADDAB = 1;                          // for display only
            this.togDELTABDIV = 1;                      // for display only
            this.togZCT = 1;                            // for display only
            this.SHIFT = 0x15;                          // for display only
            if (this.B == 0) {
                this.B = 0x9999;
            } else {
                this.B = this.bcdAdd(this.B, 0x9999) % 0x10000; // add -1
                this.setTimingToggle(0);                // stay in Execute
                this.setOverflow(1);                    // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // display only
            this.D = 0;
            this.executeComplete();
            break;

        case 0x23:      //---------------- RO   Round A, Clear R
            this.procTime += 6;
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01;
            // Add round-off (as the carry bit) to absolute value of A.
            this.A = this.bcdAdd(this.A%0x10000000000, 0, 0, (this.R < 0x5000000000 ? 0 : 1));
            if (this.A >= 0x10000000000) {
                this.setOverflow(1);                    // overflow occurred
                this.A -= 0x10000000000;                // remove the overflow bit
            }
            this.A += this.togSIGN*0x10000000000;       // restore the sign bit in A
            this.D = this.R = 0;                        // clear D & R
            this.executeComplete();
            break;

        case 0x24:      //---------------- BF4  Block from 4000 Loop
        case 0x25:      //---------------- BF5  Block from 5000 loop
        case 0x26:      //---------------- BF6  Block from 6000 loop
        case 0x27:      //---------------- BF7  Block from 7000 loop
            this.blockFromLoop(this.COP-0x20, this.executeComplete);
            break;

        case 0x28:      //---------------- CC   Change Conditionally
            if (!this.stopOverflow) {                   // check if branch should occur
                this.procTime += 1;
                this.SHIFTCONTROL = 0x04;               // no -- set for display only
            } else {
                this.procTime += 4;
                this.setOverflow(0);                    // reset overflow and do the branch
                this.SHIFT = 0x15;                      // for display only
                this.SHIFTCONTROL = 0x07;               // for display only
                this.CCONTROL = this.CADDR;             // copy address to control counter
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        case 0x29:      //---------------- CCR  Change Conditionally, Record
            if (!this.stopOverflow) {                   // check if branch should occur
                this.procTime += 1;
                this.SHIFTCONTROL = 0x04;               // for display only
            } else {
                this.procTime += 4;
                this.setOverflow(0);                    // reset overflow and do the branch
                this.SHIFT = 0x15;                      // for display only
                this.SHIFTCONTROL = 0x07;               // for display only
                this.R = this.CCONTROL*0x1000000;       // save current control counter
                this.CCONTROL = this.CADDR;             // copy address to control counter
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        case 0x30:      //---------------- CUB  Change Unconditionally, Block to 7000 Loop
            this.procTime += 4;
            this.SHIFT = 0x15;                          // for display only
            this.SHIFTCONTROL = 0x0F;                   // for display only
            this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.blockToLoop(7, this.executeComplete);
            break;

        case 0x31:      //---------------- CUBR Change Unconditionally, Block to 7000 Loop, Record
            this.procTime += 4;
            this.SHIFT = 0x15;                          // for display only
            this.SHIFTCONTROL = 0x0F;                   // for display only
            this.R = this.CCONTROL*0x1000000;           // save current control counter
            this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.blockToLoop(7, this.executeComplete);
            break;

        case 0x32:      //---------------- IB   Increase B
            this.procTime += 5;
            this.togADDAB = 1;                          // for display only
            this.togDELTABDIV = 1;                      // for display only
            this.togZCT = 1;                            // for display only
            this.SHIFT = 0x15;                          // for display only
            this.B = this.bcdAdd(this.B, 1) % 0x10000;  // discard any overflow in B
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // display only
            this.D = 0;
            this.executeComplete();
            break;

        case 0x33:      //---------------- CR   Clear R
            this.SHIFTCONTROL = 0x04;                   // for display only
            this.R = 0;
            this.executeComplete();
            break;

        case 0x34:      //---------------- BT4  Block to 4000 Loop
        case 0x35:      //---------------- BT5  Block to 5000 Loop
        case 0x36:      //---------------- BT6  Block to 6000 Loop
        case 0x37:      //---------------- BT7  Block to 7000 Loop
            this.blockToLoop(this.COP-0x30, this.executeComplete);
            break;

        case 0x38:      //---------------- CCB  Change Conditionally, Block to 7000 Loop
            this.procTime += 4;
            if (!this.stopOverflow) {                   // check if branch should occur
                this.SHIFTCONTROL = 0x04;               // for display only
                this.executeComplete();
            } else {
                this.setOverflow(0);                    // reset overflow and do the branch
                this.SHIFT = 0x15;                      // for display only
                this.SHIFTCONTROL = 0x0F;               // for display only
                this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
                this.blockToLoop(7, this.executeComplete);
            }
            break;

        case 0x39:      //---------------- CCBR Change Conditionally, Block to 7000 Loop, Record
            this.procTime += 4;
            if (!this.stopOverflow) {                   // check if branch should occur
                this.SHIFTCONTROL = 0x04;               // for display only
                this.executeComplete();
            } else {
                this.setOverflow(0);                    // reset overflow and do the branch
                this.SHIFT = 0x15;                      // for display only
                this.SHIFTCONTROL = 0x0F;               // for display only
                this.R = this.CCONTROL*0x1000000;       // save current control counter
                this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
                this.blockToLoop(7, this.executeComplete);
            }
            break;

        case 0x40:      //---------------- MTR  Magnetic Tape Read
            if (!this.magTape) {
                this.executeComplete();
            } else {
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x0F;
                d = (this.CEXTRA >>> 8) & 0xFF;         // number of blocks
                this.togMT3P = 1;
                this.togMT1BV4 = d & 0x01;              // select initial loop buffer
                this.togMT1BV5 = 1-this.togMT1BV4;
                // Mark time during I/O, add 36 word-times for controller setup
                this.procTime += 36 - performance.now()*D205Processor.wordsPerMilli;
                if (this.magTape.read(this.selectedUnit, d, this.boundMagTapeReceiveBlock)) {
                    this.setOverflow(1);                // control or tape unit busy/not-ready
                    this.togMT3P = this.togMT1BV4 = this.togMT1BV5 = 0;
                    this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time
                    this.executeComplete();
                }
            }
            break;

        // 0x41:        //---------------- (no op)

        case 0x42:      //---------------- MTS  Magnetic Tape Search
            if (this.magTape) {
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x0F;
                d = (this.CEXTRA >>> 8) & 0xFF;         // lane number
                // Mark time during I/O, add 36 word-times for controller setup
                this.procTime += 36 - performance.now()*D205Processor.wordsPerMilli;
                if (this.magTape.search(this.selectedUnit, d, this.CADDR)) {
                    this.setOverflow(1);                // control or tape unit busy/not-ready
                }
                this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time
            }
            this.executeComplete();
            break;

        // 0x43:        //---------------- (no op)

        case 0x44:      //---------------- CDR  Card Read (Cardatron)
            this.D = 0;
            if (!this.cardatron) {
                this.executeComplete();
            } else {
                this.tog3IO = 1;
                this.kDigit = (this.CEXTRA >>> 8) & 0x0F;
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x07;
                this.SHIFT = 0x08;                      // prepare to receive 11 digits
                this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
                this.cardatron.inputInitiate(this.selectedUnit, this.kDigit, this.boundCardatronReceiveWord);
            }
            break;

        case 0x45:      //---------------- CDRI Card Read Interrogate
            this.selectedUnit = (this.CEXTRA >>> 4) & 0x07;
            if (this.cardatron && this.cardatron.inputReadyInterrogate(this.selectedUnit)) {
                this.R = this.CCONTROL*0x1000000;
                this.setTimingToggle(0);                // stay in Execute
                this.setOverflow(1);                    // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        // 0x46-0x47:   //---------------- (no op)

        case 0x48:      //---------------- CDRF Card Read Format
            if (!this.cardatron) {
                this.executeComplete();
            } else {
                this.tog3IO = 1;
                this.kDigit = (this.CEXTRA >>> 8) & 0x0F;
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x07;
                this.SHIFT = 0x19;                      // start at beginning of a word
                this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
                this.cardatron.inputFormatInitiate(this.selectedUnit, this.kDigit,
                        this.boundCardatronOutputWord, this.boundCardatronOutputFinished);
            }
            break;

        // 0x49:        //---------------- (no op)

        case 0x50:      //---------------- MTW  Magnetic Tape Write
            if (!this.magTape) {
                this.executeComplete();
            } else {
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x0F;
                d = (this.CEXTRA >>> 8) & 0xFF;         // number of blocks
                this.togMT3P = 1;
                this.togMT1BV4 = d & 0x01;              // select initial loop buffer
                this.togMT1BV5 = 1-this.togMT1BV4;
                // Mark time during I/O, add 36 word-times for controller setup
                this.procTime += 36 - performance.now()*D205Processor.wordsPerMilli;
                if (this.magTape.write(this.selectedUnit, d, this.boundMagTapeInitiateSend)) {
                    this.setOverflow(1);                // control or tape unit busy/not-ready
                    this.togMT3P = this.togMT1BV4 = this.togMT1BV5 = 0;
                    this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time
                    this.executeComplete();
                }
            }
            break;

        // 0x51:        //---------------- (no op)

        case 0x52:      //---------------- MTRW Magnetic Tape Rewind
            if (this.magTape) {
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x0F;
                // Mark time during I/O, add 36 word-times for controller setup
                this.procTime += 36 - performance.now()*D205Processor.wordsPerMilli;
                if (this.magTape.rewind(this.selectedUnit)) {
                    this.setOverflow(1);                // control or tape unit busy/not-ready
                }
                this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time
            }
            this.executeComplete();
            break;

        // 0x53:        //---------------- (no op)

        case 0x54:      //---------------- CDW  Card Write (Cardatron)
            if (!this.cardatron) {
                this.executeComplete();
            } else {
                this.tog3IO = 1;
                this.kDigit = (this.CEXTRA >>> 8) & 0x0F;
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x07;
                this.SHIFT = 0x19;                      // start at beginning of a word
                this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
                this.cardatron.outputInitiate(this.selectedUnit, this.kDigit, (this.CEXTRA >>> 12) & 0x0F,
                        this.boundCardatronOutputWord, this.boundCardatronOutputFinished);
            }
            break;

        case 0x55:      //---------------- CDWI Card Write Interrogate
            this.selectedUnit = (this.CEXTRA >>> 4) & 0x07;
            if (this.cardatron && this.cardatron.outputReadyInterrogate(this.selectedUnit)) {
                this.R = this.CCONTROL*0x1000000;
                this.setTimingToggle(0);                // stay in Execute
                this.setOverflow(1);                    // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        // 0x56-0x57:   //---------------- (no op)

        case 0x58:      //---------------- CDWF Card Write Format
            if (!this.cardatron) {
                this.executeComplete();
            } else {
                this.tog3IO = 1;
                this.kDigit = (this.CEXTRA >>> 8) & 0x0F;
                this.selectedUnit = (this.CEXTRA >>> 4) & 0x07;
                this.SHIFT = 0x19;                      // start at beginning of a word
                this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
                this.cardatron.outputFormatInitiate(this.selectedUnit, this.kDigit,
                        this.boundCardatronOutputWord, this.boundCardatronOutputFinished);
            }
            break;

        // 0x59:        //---------------- (no op)

        default:        //---------------- (unimplemented instruction -- no op)
            this.executeComplete();
            break;
        } // switch this.COP
    }
};

/**************************************/
D205Processor.prototype.start = function start() {
    /* Initiates the processor according to the current Timing Toggle state */
    var realTime = performance.now()*D205Processor.wordsPerMilli;

    if (this.togCST && this.poweredOn) {
        this.procStart = realTime;
        this.procTime = realTime;
        this.memoryStopTime = realTime;

        this.stopIdle = 0;
        this.stopControl = 0;
        this.stopBreakpoint = this.togBKPT = 0;
        // stopOverflow, stopSector, and stopForbidden are not reset by the START button

        this.togCST = 0;
        if (this.togTiming && !this.sswLockNormal) {
            this.fetch();
        } else {
            this.setTimingToggle(0);
            this.execute();
        }
    }
};

/**************************************/
D205Processor.prototype.stop = function stop() {
    /* Stops running the processor on the Javascript thread */

    if (this.poweredOn) {
        this.togCST = 1;
        this.cctContinuous = 0;
        this.stopIdle = 1;              // turn on the IDLE lamp
        if (this.scheduler) {
            clearCallback(this.scheduler);
            this.scheduler = 0;
        }
    }
};

/**************************************/
D205Processor.prototype.inputSetup = function inputSetup(unitNr) {
    /* Called from the Cardatron Control Unit. If the Processor is stopped,
    loads a CDR (44) instruction into C for unit "unitNr" */

    if (this.togCST && this.poweredOn) {
        this.CEXTRA = unitNr*0x10;
        this.COP = 0x44;
        this.CADDR = 0;
        this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
        this.setTimingToggle(0);
    }
};

/**************************************/
D205Processor.prototype.powerUp = function powerUp() {
    /* Powers up the system */

    if (!this.poweredOn) {
        this.clear();
        this.poweredOn = 1;
        this.console = this.devices.ControlConsole;
        this.cardatron = this.devices.CardatronControl;
        this.magTape = this.devices.MagTapeControl;
        this.lastGlowTime = performance.now()*D205Processor.wordsPerMilli;
        this.glowTimer = setInterval(this.boundUpdateLampGlow, D205Processor.lampGlowInterval);
    }
};

/**************************************/
D205Processor.prototype.powerDown = function powerDown() {
    /* Powers down the system */

    if (this.poweredOn) {
        this.stop();
        this.clear();
        this.poweredOn = 0;
        this.cardatron = null;
        this.console = null;
        this.magTape = null;
        if (this.glowTimer) {
            clearInterval(this.glowTimer);
            this.glowTimer = null;
        }
    }
};

/**************************************/
D205Processor.prototype.loadDefaultProgram = function loadDefaultProgram() {
    /* Loads a set of default demo programs to the memory drum */

    // Simple counter speed test
    this.MM[   0] = 0x0000740002;       // ADD     2
    this.MM[   1] = 0x0000200000;       // CU      0
    this.MM[   2] = 0x0000000001;       // LIT     1

    // Bootstrap to loop-based square-roots test
    this.MM[  10] = 0x0000360200        // BT6   200
    this.MM[  11] = 0x0000370220        // BT7   220
    this.MM[  12] = 0x0000206980        // CU   6980  branch to loop-6 entry point

    // Hello World
    this.MM[  20] = 0x0000070500;       // PTWF 0500  line feed
    this.MM[  21] = 0x0000640027;       // CAD    27
    this.MM[  22] = 0x0000030410;       // PTW  0410
    this.MM[  23] = 0x0000070800;       // PTWF 0800  space
    this.MM[  24] = 0x0000640028;       // CAD    28
    this.MM[  25] = 0x0000030410;       // PTW  0410
    this.MM[  26] = 0x0000089429;       // HALT 9429
    this.MM[  27] = 0x4845535356;       // LIT  "HELLO"
    this.MM[  28] = 0x6656595344;       // LIT  "WORLD"

    // Clear memory the straightforward (and pretty slow) way
    this.MM[  50] = 0x00000023999;      // STC  3999    clear A
    this.MM[  51] = 0x00000720050;      // SB     50    set B to 3999
    this.MM[  52] = 0x00000300053;      // CUB    52
    this.MM[  53] = 0x10000020000;      // STC  0+B     zero MM[B]
    this.MM[  54] = 0x00000227053;      // DB   7053    decrement B and branch if >= 0
    this.MM[  55] = 0x09999089999;      // STOP 9999    halt

    // Tom Sawyer's "Square Roots 100" (Babylonian or Newton's method):
    this.MM[ 100] = 0x640139;           // CAD   139
    this.MM[ 101] = 0x120138;           // ST    138
    this.MM[ 102] = 0x640139;           // CAD   139
    this.MM[ 103] = 0x130005;           // SR    5
    this.MM[ 104] = 0x610138;           // DIV   138
    this.MM[ 105] = 0x120137;           // ST    137
    this.MM[ 106] = 0x750138;           // SUB   138
    this.MM[ 107] = 0x120136;           // ST    136
    this.MM[ 108] = 0x660136;           // CADA  136
    this.MM[ 109] = 0x750135;           // SUB   135
    this.MM[ 110] = 0x730135;           // OSGD  135
    this.MM[ 111] = 0x280118;           // CC    118
    this.MM[ 112] = 0x640138;           // CAD   138
    this.MM[ 113] = 0x740137;           // ADD   137
    this.MM[ 114] = 0x130005;           // SR    5
    this.MM[ 115] = 0x610134;           // DIV   134
    this.MM[ 116] = 0x120138;           // ST    138
    this.MM[ 117] = 0x200102;           // CU    102
    this.MM[ 118] = 0x640139;           // CAD   139
    this.MM[ 119] = 0x030505;           // PTW   0505
    this.MM[ 120] = 0x640137;           // CAD   137
    this.MM[ 121] = 0x030810;           // PTW   0810
    this.MM[ 122] = 0x640139;           // CAD   139
    this.MM[ 123] = 0x740133;           // ADD   133
    this.MM[ 124] = 0x120139;           // ST    139
    this.MM[ 125] = 0x200102;           // CU    102
    this.MM[ 126] = 0;
    this.MM[ 127] = 0;
    this.MM[ 128] = 0;
    this.MM[ 129] = 0;
    this.MM[ 130] = 0;
    this.MM[ 131] = 0;
    this.MM[ 132] = 0;
    this.MM[ 133] = 0x100000;
    this.MM[ 134] = 0x200000;
    this.MM[ 135] = 0x10;
    this.MM[ 136] = 0;
    this.MM[ 137] = 0;
    this.MM[ 138] = 0;
    this.MM[ 139] = 0x200000;

    // "Square Roots 100" running from the loops with R cleared for division:
    // Block for the 6980 loop
    this.MM[ 200] = 0x0000647039;       // CAD  7039
    this.MM[ 201] = 0x0000127038;       // ST   7038
    this.MM[ 202] = 0x0000647039;       // CAD  7039
    this.MM[ 203] = 0x0000330000;       // CR
    this.MM[ 204] = 0x0000130005;       // SR   5
    this.MM[ 205] = 0x0000617038;       // DIV  7038
    this.MM[ 206] = 0x0000127037;       // ST   7037
    this.MM[ 207] = 0x0000757038;       // SUB  7038
    this.MM[ 208] = 0x0000127036;       // ST   7036
    this.MM[ 209] = 0x0000667036;       // CADA 7036
    this.MM[ 210] = 0x0000757035;       // SUB  7035
    this.MM[ 211] = 0x0000737035;       // OSGD 7035
    this.MM[ 212] = 0x0000287000;       // CC   7000
    this.MM[ 213] = 0x0000647038;       // CAD  7038
    this.MM[ 214] = 0x0000747037;       // ADD  7037
    this.MM[ 215] = 0x0000330000;       // CR
    this.MM[ 216] = 0x0000130005;       // SR   5
    this.MM[ 217] = 0x0000617034;       // DIV  7034
    this.MM[ 218] = 0x0000127038;       // ST   7038
    this.MM[ 219] = 0x0000206982;       // CU   6982
    // Block for the 7000 loop
    this.MM[ 220] = 0x0000647039;       // CAD  7039
    this.MM[ 221] = 0x0000030505;       // PTW  0505
    this.MM[ 222] = 0x0000647037;       // CAD  7037
    this.MM[ 223] = 0x0000030810;       // PTW  0810
    this.MM[ 224] = 0x0000647039;       // CAD  7039
    this.MM[ 225] = 0x0000747033;       // ADD  7033
    this.MM[ 226] = 0x0000127039;       // ST   7039
    this.MM[ 227] = 0x0000206982;       // CU   6982
    this.MM[ 228] = 0;
    this.MM[ 229] = 0;
    this.MM[ 230] = 0;
    this.MM[ 231] = 0;
    this.MM[ 232] = 0;
    this.MM[ 233] = 0x0000100000;
    this.MM[ 234] = 0x0000200000;
    this.MM[ 235] = 0x0000000010;
    this.MM[ 236] = 0;
    this.MM[ 237] = 0;
    this.MM[ 238] = 0;
    this.MM[ 239] = 0x0000200000;

    // "Square Roots 100" adapted for floating-point and relative precision:
    this.MM[ 300] = 0x0000640339;       // CAD   339    load initial argument
    this.MM[ 301] = 0x0000120338;       // ST    338    store as initial upper bound
    this.MM[ 302] = 0x0000640339;       // CAD   339    start of loop: load current argument
    this.MM[ 303] = 0x0000330000;       // CR           clear R
    this.MM[ 304] = 0x0000830338;       // FDIV  338    divide argument by upper bound
    this.MM[ 305] = 0x0000120337;       // ST    337    store as current result
    this.MM[ 306] = 0x0000830338;       // FDIV  338    ratio to upper bound
    this.MM[ 307] = 0x0000120336;       // ST    336    store as current precision
    this.MM[ 308] = 0x0000660335;       // CADA  335    load target precision
    this.MM[ 309] = 0x0000810336;       // FSU   336    subtract current precision
    this.MM[ 310] = 0x0000730335;       // OSGD  335    if current precision > target precision
    this.MM[ 311] = 0x0000280318;       // CC    318        we're done -- jump out to print
    this.MM[ 312] = 0x0000640338;       // CAD   338    load current upper bound
    this.MM[ 313] = 0x0000800337;       // FAD   337    add current result
    this.MM[ 314] = 0x0000330000;       // CR           clear R
    this.MM[ 315] = 0x0000830334;       // FDIV  334    divide by 2.0 to get new upper bound
    this.MM[ 316] = 0x0000120338;       // ST    338    store new upper bound
    this.MM[ 317] = 0x0000200302;       // CU    302    do another iteration
    this.MM[ 318] = 0x0001640339;       // CAD   339
    this.MM[ 319] = 0x0000030510;       // PTW   0510
    this.MM[ 320] = 0x0000640337;       // CAD   337
    this.MM[ 321] = 0x0000030810;       // PTW   0810
    this.MM[ 322] = 0x0000640339;       // CAD   339    load argument value
    this.MM[ 323] = 0x0000800333;       // FAD   333    add 1 to argument value
    this.MM[ 324] = 0x0000120339;       // ST    339
    this.MM[ 325] = 0x0000200301;       // CU    301    start sqrt for next argument value
    this.MM[ 326] = 0;
    this.MM[ 327] = 0;
    this.MM[ 328] = 0;
    this.MM[ 329] = 0;
    this.MM[ 330] = 0;
    this.MM[ 331] = 0;
    this.MM[ 332] = 0;
    this.MM[ 333] = 0x05110000000;      // 1.0 literal: argument increment
    this.MM[ 334] = 0x05120000000;      // 2.0 literal
    this.MM[ 335] = 0x05099999990;      // 0.99999990 literal: target precision
    this.MM[ 336] = 0;                  // current precision
    this.MM[ 337] = 0;                  // current sqrt result
    this.MM[ 338] = 0;                  // current upper bound on result
    this.MM[ 339] = 0x05120000000;      // 2.0 sqrt argument

    // Counter speed test in 4000 loop
    this.L4[   0] = 0x0000744002;       // ADD  4002 -- start of counter speed test
    this.L4[   1] = 0x0000204000;       // CU   4000
    this.L4[   2] = 0x0000000001;       // LIT     1
};
