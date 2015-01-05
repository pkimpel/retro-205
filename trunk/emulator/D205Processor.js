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
*   Burroughs 205 Handbook (Bulletin 3021, Burroughs Corporation, 1956).
*   Programming and Coding Manual, Datatron (Bulletin 3040A, ElectroData Corporation, 1954).
*   Handbook of Operating Procedures for the Burroughs 205
*       (Bulletin 3034A, Burroughs Corporation, May 1960).
*
* available at:
*   http://bitsavers.org/pdf/burroughs/electrodata/205/
*
* also:
*
*   Engineering Description of the ElectroData Digital Computer, J. C. Alrich,
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
* Processor timing is maintained internally in units of "word-times": 1/200-th
* revolution of the memory drum, or about 84 µs at 3570rpm.
*
************************************************************************
* 2014-11-29  P.Kimpel
*   Original version, from thin air and a little bit of retro-B5500 code.
***********************************************************************/
"use strict";

/**************************************/
function D205Processor(devices) {
    /* Constructor for the 205 Processor module object */

    // Emulator control
    this.poweredOn = 0;                 // System is powered on and initialized
    this.devices = devices;             // Hash of I/O device objects
    this.console = null;                // Reference to Control Console for I/O
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
    this.cswOutput = 0;                 // Output knob: 0=Off, 1=Page, 2=Tape
    this.cswInput = 0;                  // Input knob: 0=Mechanical reader, 1=Optical reader, 2=Keyboard
    this.cswBreakpoint = 0;             // Breakpoint knob: 0=Off, 1, 2, 4

    // Context-bound routines
    this.boundExecuteComplete = D205Processor.bindMethod(this, D205Processor.prototype.executeComplete);
    this.boundOutputSignDigit = D205Processor.bindMethod(this, D205Processor.prototype.outputSignDigit);
    this.boundOutputNumberDigit= D205Processor.bindMethod(this, D205Processor.prototype.outputNumberDigit);
    this.boundOutputFinished = D205Processor.bindMethod(this, D205Processor.prototype.outputFinished);
    this.boundInputReadDigit = D205Processor.bindMethod(this, D205Processor.prototype.inputReadDigit);
    this.boundInputReceiveDigit = D205Processor.bindMethod(this, D205Processor.prototype.inputReceiveDigit);
    this.boundInputSingleDigit = D205Processor.bindMethod(this, D205Processor.prototype.inputSingleDigit);

    // Processor throttling control
    this.scheduler = 0;                 // Current setCallback token
    this.procStart = 0;                 // Javascript time that the processor started running, ms
    this.procTime = 0;                  // Total processor running time, ms

    this.clear();                       // Create and initialize the processor state

    this.loadDefaultProgram();          // Preload a default program
}

/**************************************/

/* Global constants */
D205Processor.version = "0.01";

D205Processor.trackSize = 200;          // words per drum revolution
D205Processor.loopSize = 20;            // words per high-speed loop
D205Processor.wordTime = 60/3570/D205Processor.trackSize;
                                        // one word time, about 84 µs at 3570rpm (=> 142.8 KHz)
D205Processor.wordsPerMilli = 0.001/D205Processor.wordTime;
                                        // word times per millisecond
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

    this.COP = 0;                       // copy of C register op code (2 digits)
    this.CADDR = 0;                     // copy of C register operand address (4 digits)
    this.CCONTROL = 0;                  // copy of C register control address (4 digits)

    // Adder registers
    this.ADDER = 0;                     // The adder
    this.CT = 0;                        // Carry toggles for the adder

    // Operational toggles
    this.togTiming = 0;                 // Timing toggle: 0=execute, 1=fetch
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

    // Kill any pending action that may be in process
    if (this.scheduler) {
        clearCallback(this.scheduler);
        this.scheduler = 0;
    }
};

/**************************************/
D205Processor.prototype.clearControlToggles = function clearControlToggles() {
    /* Clears the processor control toggles at end of an execution cycle.
    The adder and carry toggles should also be cleared as part of this, but
    they are often zero anyway, and we are only doing this for display purposes,
    so leave them as is */

    this.togADDER =                     // Adder toggle
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
    this.togBTOAIN = 0;                 // B-to-A, Input toggle
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

/***********************************************************************
*   Utility Functions                                                  *
***********************************************************************/

/**************************************/
D205Processor.bindMethod = function bindMethod(context, f) {
    /* Returns a new function that binds the function "f" to the object "context".
    Note that this is a static constructor property function, NOT an instance
    method of the CC object */

    return function bindMethodAnon() {f.apply(context, arguments)};
};

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
        // shift low-order augend digit right into the adder
        ad = am % 0x10;
        am = (am - ad)/0x10;
        if (ad > 9) {
            this.stopForbidden = 1;
            this.togCST = 1;            // halt the processor
        }

        // add the digits plus carry, complementing as necessary
        dd = dm % 0x10;
        if (dd > 9) {
            this.stopForbidden = 1;
            this.togCST = 1;            // halt the processor
        }
        if (compl) {
            ad = 9-ad;
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
        // rotate the adder into the sign digit
        am += adder*0x10000000000;
        // shift the addend right to the next digit
        dm = (dm - dd)/0x10;
    } // for x

    // set toggles for display purposes and return the result
    this.togCOMPL = compl;
    this.CT = ct;
    this.ADDER = adder;
    return am;
};

/**************************************/
D205Processor.prototype.signedAdd = function signedAdd(a, d) {
    /* Algebraically add the addend (d) to the augend (a), returning the result
    as the function value. All values are BCD with the sign in the 11th digit
    position. Sets the Overflow and Forbidden-Combination stops as necessary */
    var am = a % 0x10000000000;         // augend mantissa
    var aSign = ((a - am)/0x10000000000) & 0x01;
    var compl;                          // complement addition required
    var dm = d % 0x10000000000;         // addend mantissa
    var dSign = ((d - dm)/0x10000000000) & 0x01;
    var sign = dSign;                   // local copy of sign toggle

    this.togADDER = 1;                  // for display only
    this.togDPCTR = 1;                  // for display only
    compl = (aSign^dSign);
    am = this.bcdAdd(am, dm, compl, compl);

    // Now examine the resulting sign (still in the adder) to see if we have overflow
    // or need to recomplement the result
    switch (this.ADDER) {
    case 0:
        am += sign*0x10000000000;
        break;
    case 1:
        am += (sign-1)*0x10000000000;
        this.stopOverflow = 1;
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

    // set toggles for display purposes and return the result
    this.togSIGN = sign;
    return am;
};

/**************************************/
D205Processor.prototype.serialExtract = function serialExtract(a, d) {
    /* "Extract" digits from a value (a) according to the digit pattern (d).
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
    var ad;                             // current value (a) digit;
    var adder = 0;                      // local copy of adder digit
    var am = a % 0x10000000000;         // value mantissa
    var aSign = ((a - am)/0x10000000000) & 0x01;
    var carry;                          // local copy of carry toggle (CT 1)
    var ct;                             // local copy of carry register (CT 1-16)
    var dd;                             // current pattern (d) digit;
    var dm = d % 0x10000000000;         // pattern mantissa
    var dSign = ((d - dm)/0x10000000000) & 0x01;
    var sign = aSign & dSign;           // local copy of sign toggle
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
        // rotate the adder into the sign digit
        am += adder*0x10000000000;
    } // for x

    // Now examine the resulting sign (still in the adder) to see if we have overflow
    if (adder == 0) {
        am += sign*0x10000000000;
    } else if (adder == 1) {
        am += (sign-1)*0x10000000000;
        this.stopOverflow = 1;
    }

    // set toggles for display purposes and return the result
    this.togCOMPL = 0;
    this.togSIGN = sign;
    this.CT = ct;
    this.ADDER = adder;
    return am;
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

    if (roundOff) {
        ++count;
        if (rm >= 0x5000000000) {
        } else {
            am = this.bcdAdd(am, 0x01, 0, 0);
        }
        this.R = this.D = 0;
    }

    this.procTime += 13 + count*2;
    this.SPECIAL = 0x09;                // for display only
    this.togSIGN = sign;                // for display only
    this.A = sign*0x10000000000 + am;
    this.R = rm;
};

/**************************************/
D205Processor.prototype.integerDivide = function integerDivide() {
    /* Algebraically divide the A & R registerd by the D register, producing a
    signed 10-digit quotient in A and the remainder in R. All values are BCD
    with the sign in the 11th digit position. Sets Forbidden-Combination stop
    as necessary. If the magnitude of the divisor (D) is less or equal to the
    magnitude of the dividend (A), the Overflow stop it set and division
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
        this.togCOMPL = 1;
        rd = 0;
        while (am >= dm && rd < 10) {
            am = this.bcdAdd(dm, am, 1, 1);
            ++rd;
            ++count;
        }

        // Check for overflow (dividend > divisor)
        if (rd < 10) {
            this.togDIVALARM = 0;
        } else {
            this.stopOverflow = 1;
            am = rm = 0;
            break;                      // out of for loop
        }

        // Accumulate the quotient digit
        rm += rd;
    } // for x

    this.SHIFTCONTROL = 0x0E;           // for display only
    this.SHIFT = 0x09;                  // for display only
    this.SPECIAL = 0x09;                // for display only
    this.togSIGN = sign;                // for display only
    this.togSTEP = 1;                   // for display only
    this.A = sign*0x10000000000 + rm;
    this.R = am;
    if (this.stopOverflow) {
        this.procTime += 24;
    } else {
        this.procTime += 52 + count*2;
    }
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
    this.memACCESS = this.memACTION = 0;
    this.memMAIN = this.memLM = 0;
    this.memL4 = this.memL5 = this.memL6 = this.memL7 = 0;
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
    var drumTime;                       // current drum position [word-times]
    var latency;                        // drum latency in word-times
    var trackSize;                      // words/track in target band of drum

    addr = D205Processor.bcdBinary(this.CADDR % 0x8000);
    this.memACCESS = 1;
    if (addr < 4000) {
        trackSize = D205Processor.trackSize;
        this.memMAIN = this.memLM = 1;
        this.D = this.MM[addr];
    } else {
        trackSize = D205Processor.loopSize;
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

    drumTime = performance.now()*D205Processor.wordsPerMilli;
    latency = (addr%trackSize - this.procTime%trackSize + trackSize)%trackSize;
    this.procTime += latency+1;         // emulated time at end of drum access
    this.memACTION = 1;
    this.successor = successor;
    this.scheduler = setCallback("MEM", this,
            (this.procTime-drumTime)/D205Processor.wordsPerMilli, this.readMemoryFinish);
};

/**************************************/
D205Processor.prototype.writeMemoryFinish = function writeMemoryFinish(clearA) {
    /* Completes a write of the memory drum after an appropriate delay for drum
    latency. A has already been moved to the memory word, so just clears the
    memory control toggles, and calls the current successor function */

    this.scheduler = 0;
    this.memACCESS = this.memACTION = 0;
    this.memMAIN = this.memLM = 0; this.memRWM = this.memRWL = this.memWDBL = 0;
    this.memL4 = this.memL5 = this.memL6 = this.memL7 = 0;
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
    var drumTime;                       // current drum position [word-times]
    var latency;                        // drum latency in word-times
    var trackSize;                      // words/track in target band of drum

    addr = D205Processor.bcdBinary(this.CADDR % 0x8000);
    this.memACCESS = 1;
    if (addr < 4000) {
        trackSize = D205Processor.trackSize;
        this.memMAIN = this.memLM = this.memRWM = 1;
        this.MM[addr] = this.A;
    } else {
        trackSize = D205Processor.loopSize;
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

    drumTime = performance.now()*D205Processor.wordsPerMilli;
    latency = (addr%trackSize - this.procTime%trackSize + trackSize)%trackSize;
    this.procTime += latency+1;         // emulated time at end of drum access
    this.memACTION = 1;
    this.successor = successor;
    this.scheduler = setCallback("MEM", this,
            (this.procTime-drumTime)/D205Processor.wordsPerMilli, this.writeMemoryFinish, clearA);
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
    var drumTime;                       // current drum position [word-times]
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

    for (x=0; x<D205Processor.loopSize; ++x) {
        this.MM[addr] = loopMem[addr%D205Processor.loopSize];
        if ((++addr)%D205Processor.trackSize == 0) {
            addr %= 4000;           // handle main memory address wraparound
            // bump the track counter in the C register (for display only)
            this.CADDR = this.bcdAdd(this.CADDR, 0x200)%0x10000;
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
        }
    } // for x

    drumTime = performance.now()*D205Processor.wordsPerMilli;
    latency = (addr%D205Processor.trackSize - this.procTime%D205Processor.trackSize +
               D205Processor.trackSize)%D205Processor.trackSize;
    this.procTime += latency+D205Processor.loopSize+1; // emulated time at end of drum access
    this.memACTION = 1;
    this.successor = successor;
    this.scheduler = setCallback("MEM", this,
            (this.procTime-drumTime)/D205Processor.wordsPerMilli, this.writeMemoryFinish, false);
};

/**************************************/
D205Processor.prototype.blockToLoop = function blockToLoop(loop, successor) {
    /* Copies 20 words from the main memory at the BCD address specified by
    C3-C6 to the designated loop. After an appropriate delay for drum latency,
    the successor function is called. Sets the memory access toggles as
    necessary.
    Note: the words SHOULD be copied at the END of the drum latency delay,
    but we do it here, so that the updated registers will show on the panels
    during the delay for drum latency */
    var addr;                           // main binary address, mod 4000
    var drumTime;                       // current drum position [word-times]
    var latency;                        // drum latency in word-times
    var loopMem;                        // reference to the loop memory array
    var x;                              // iteration control

    addr = D205Processor.bcdBinary(this.CADDR % 0x4000);
    this.memACCESS = 1;
    this.memMAIN = this.memLM = this.memRWL = this.memWDBL = 1;
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

    for (x=0; x<D205Processor.loopSize; ++x) {
        loopMem[addr%D205Processor.loopSize] = this.MM[addr];
        if ((++addr)%D205Processor.trackSize == 0) {
            addr %= 4000;           // handle main memory address wraparound
            // bump the track counter in the C register (for display only)
            this.CADDR = this.bcdAdd(this.CADDR, 0x200)%0x10000;
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
        }
    } // for x

    drumTime = performance.now()*D205Processor.wordsPerMilli;
    latency = (addr%D205Processor.trackSize - this.procTime%D205Processor.trackSize +
               D205Processor.trackSize)%D205Processor.trackSize;
    this.procTime += latency+D205Processor.loopSize+1; // emulated time at end of drum access
    this.memACTION = 1;
    this.successor = successor;
    this.scheduler = setCallback("MEM", this,
            (this.procTime-drumTime)/D205Processor.wordsPerMilli, this.writeMemoryFinish, false);
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
    the D register, so the latency delay is already accounted for. It will
    proceed to search up to 200 words (one drum track) at a time, then if no
    match is found, perform a catch-up delay. A final partial delay is performed
    at the end of the search.

    Note: the MSH (85) and MSE (88) instructions apparently were a custom
    modification in 1959 for a 205 to be delivered to the Eaton Manufacturing
    Company. A description of these instructions was found in the back of the
    205 Handbook included with Donald Knuth's papers donated to the Computer
    History Museum in Mountain View, California */
    var addr;                           // main binary address, mod 4000
    var aWord = this.A % 0x10000000000; // search target word
    var drumTime;                       // current drum position [word-times]
    var dWord;                          // result of comparison D:A
    var found = false;                  // true if matching word found
    var x = 0;                          // iteration control

    addr = D205Processor.bcdBinary(this.CADDR % 0x4000);
    this.memACCESS = this.memACTION = this.memMAIN = this.memLM = 1;

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
            this.stopOverflow = 1;
            break;                      // out of do loop -- end of main memory
        }
    } while (++x < D205Processor.trackSize);

    this.CADDR = D205Processor.binaryBCD(addr);
    this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
    if (found) {
        this.A = this.D;
        this.R = this.CADDR*0x1000000 + this.R%0x1000000;
        this.memACCESS = this.memACTION = this.memMAIN = this.memLM = 0;
        this.successor = this.executeComplete;
    } else if (this.stopOverflow) {
        this.memACCESS = this.memACTION = this.memMAIN = this.memLM = 0;
        this.successor = this.executeComplete;
    } else {
        this.successor = searchMemory;
    }

    this.procTime += x;
    drumTime = performance.now()*D205Processor.wordsPerMilli;
    this.scheduler = setCallback("MEM", this,
            (this.procTime-drumTime)/D205Processor.wordsPerMilli, this.successor, high);
};

/***********************************************************************
*   I/O Module                                                         *
***********************************************************************/

/**************************************/
D205Processor.prototype.outputSignDigit = function outputSignDigit() {
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
            this.outputFinished();
        } else {
            this.togOK = 1-this.togOK;  // for dislay only
            this.togPO2 = 1;            // for display only
            this.togDELAY = 0;          // for display only
            this.console.writeSignDigit(d, this.boundOutputNumberDigit);
        }
    }
};

/**************************************/
D205Processor.prototype.outputNumberDigit = function outputNumberDigit() {
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
            this.console.writeFinish(d, this.boundOutputFinished);
        } else {
            d = (this.A - w)/0x10000000000; // get the digit
            this.A = w*0x10 + d;        // rotate A+sign left one
            this.SHIFT = this.bcdAdd(this.SHIFT, 1);
            this.console.writeNumberDigit(d, this.boundOutputNumberDigit);
        }
    }
};

/**************************************/
D205Processor.prototype.outputFinished = function outputFinished() {
    /* Handles the final cycle of an I/O operation and restores this.procTime */

    if (this.togPO1) {                  // if false, we've probably been cleared
        this.togOK = 0;                 // for display only
        this.togPO1 = this.togPO2 = 0;  // for display only
        this.togDELAY = 0;              // for display only
        this.stopIdle = 0;              // turn IDLE lamp back off now that we're done
        this.procTime += performance.now()*D205Processor.wordsPerMilli;
        this.executeComplete();
    }
};

/**************************************/
D205Processor.prototype.inputReadDigit = function inputReadDigit() {
    // Solicits the next input digit from the Control Console */

    this.togTF = 0;                     // for display only, reset finish pulse
    this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
    this.console.readDigit(this.boundInputReceiveDigit);
};

/**************************************/
D205Processor.prototype.inputReceiveDigit = function inputReceiveDigit(digit) {
    /* Handles an input digit coming from the Control Console keyboard or
    paper-tape reader. Negative values indicate a finish pulse; otherwise
    the digit is data read from the device. Data digits are rotated into
    the D register; finish pulses are handled according to the sign of the
    D register */
    var sign;                           // register sign digit
    var word;                           // register word less sign

    this.procTime += performance.now()*D205Processor.wordsPerMilli; // restore time after I/O
    if (digit >= 0) {
        this.togTC1 = 1-this.togTC1;    // for display only
        this.togTC2 = 1-this.togTC2;    // for display only
        this.D = (this.D % 0x10000000000)*0x10 + digit;
        this.inputReadDigit();
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
            this.togTiming = 0;         // Execute mode
            this.togCOUNT = 1;
            this.togBATOAIN = 0;
            this.togADDAB = 1;          // for display only
            this.togADDER = 1;          // for display only
            this.togDPCTR = 1;          // for display only
            this.togCLEAR = 1-(sign & 0x01);
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // display only
            sign &= 0x80;

            // Increment the destination address (except on the first word)
            this.SHIFTCONTROL = 0x01;   // for display only
            this.SHIFT = 0x13;          // for display only
            if (this.togCOUNT) {
                this.CCONTROL = this.bcdAdd(this.CADDR, 1)%0x10000;
            }

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
            this.togBTOAIN = 0;
            this.execute();
        } else {
            // D-sign is 0, 1, 2, 3: store word, possibly modified by B
            this.procTime += 3;
            this.togTiming = 1;         // Fetch mode
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
            this.writeMemory(this.boundInputReadDigit, false);
        }
    }
};

/**************************************/
D205Processor.prototype.inputSingleDigit = function inputSingleDigit(digit) {
    /* Handles a single input digit coming from the Control Console keyboard
    or paper-tape reader, as in the case of Digit Add (10). Negative values
    indicate a finish pulse, which is ignored, and causes another digit to be
    solicited from the Console; otherwise the digit is (virtually) moved to
    the D register and then (actually) added to the A register */
    var sign;                           // register sign digit
    var word;                           // register word less sign

    if (digit < 0) {                    // ignore finish pulse and just re-solicit
        this.console.readDigit(this.boundInputSingleDigit);
    } else {
        this.procTime += performance.now()*D205Processor.wordsPerMilli + 4; // restore time after I/O
        this.togSTART = 0;
        this.A = this.signedAdd(this.A, digit);
        this.D = 0;
        this.executeComplete();
    }
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
    this.D = (this.D - addr)/0x1000000;                 // shift D right six digits
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
    var breakDigit = ((this.D%0x10000000 - this.D%0x1000000)/0x1000000) & 0x0F;

    this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01;
    if (this.cswBreakpoint & breakDigit) { // check for breakpoint stop
        this.togBKPT = 1;               // prepare to halt after this instruction
    }

    this.transferDtoC();
    this.procTime += 4;                 // minimum alpha for all orders is 4
    if (this.cswSkip && (breakDigit & 0x08)) {
        if (!this.sswLockNormal) {
            this.togTiming = 1;         // stay in Fetch to skip this instruction
        }
        if (breakDigit & 0x01) {
            this.togCST = 1;            // halt the processor
        }
    }

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
    or by the prior operation complete if the processor is in continuous mode */

    this.CADDR = this.C % 0x100000000;  // C operand and control addresses
    this.CCONTROL = this.CADDR % 0x10000; // C control address
    this.COP = (this.C - this.CADDR)/0x100000000; // C operation code
    this.CADDR = (this.CADDR - this.CCONTROL)/0x10000;

    this.togT0 = 0;                     // for display only, leave it off for fetch cycle
    if (this.togSTART) {
        this.inputReadDigit();          // we're still executing a Console input command
    } else {
        this.togTiming = 0;             // next cycle will be Execute by default
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
        this.togBKPT = 0;
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
        this.procTime += 3;
        this.A = this.serialExtract(this.A, this.D);
        this.D = 0;
        break;

    case 0x64:          //---------------- CAD  Clear and Add A
        this.procTime += 3;
        this.A = this.signedAdd(0, this.D);
        this.D = 0;
        break;

    case 0x65:          //---------------- CSU  Clear and Subtract A
        this.procTime += 3;
        this.A = this.signedAdd(0, this.D + 0x10000000000); // any sign overflow will be ignored
        this.D = 0;
        break;

    case 0x66:          //---------------- CADA Clear and Add Absolute
        this.procTime += 3;
        this.A = this.signedAdd(0, this.D % 0x10000000000);
        this.D = 0;
        break;

    case 0x67:          //---------------- CSUA Clear and Subtract Absolute
        this.procTime += 3;
        this.A = this.signedAdd(0, this.D % 0x10000000000 + 0x10000000000);
        this.D = 0;
        break;

    // 0x68-0x69:       //---------------- (no op)

    case 0x70:          //---------------- MRO  Multiply and Round
        this.integerMultiply(true);
        break;

    case 0x71:          //---------------- EXC  External Control
        // at present, EXC is effectively a no op
        break;

    case 0x72:          //---------------- SB   Set B
        this.procTime += 3;
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
        this.procTime += 2;
        this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // for display, mostly
        this.stopOverflow = this.togSIGN ^
                (((this.D - this.D%0x10000000000)/0x10000000000) & 0x01);
        break;

    case 0x74:          //---------------- AD   Add
        this.procTime += 3;
        this.A = this.signedAdd(this.A, this.D);
        this.D = 0;
        break;

    case 0x75:          //---------------- SU   Subtract
        this.procTime += 3;
        this.A = this.signedAdd(this.A, this.D + 0x10000000000); // any sign overflow will be ignored
        this.D = 0;
        break;

    case 0x76:          //---------------- ADA  Add Absolute
        this.procTime += 3;
        this.A = this.signedAdd(this.A, this.D % 0x10000000000);
        this.D = 0;
        break;

    case 0x77:          //---------------- SUA  Subtract Absolute
        this.procTime += 3;
        this.A = this.signedAdd(this.A, this.D % 0x10000000000 + 0x10000000000);
        this.D = 0;
        break;

    // 0x78-0x79:       //---------------- (no op)

    case 0x80:          //---------------- FAD  Floating Add
        break;

    case 0x81:          //---------------- FSU  Floating Subtract
        break;

    case 0x82:          //---------------- FM   Floating Multiply
        break;

    case 0x83:          //---------------- FDIV Floating Divide
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
        break;

    case 0x91:          //---------------- FSA  Floating Subtract Absolute
        break;

    case 0x92:          //---------------- FMA  Floating Multiply Absolute
        break;

    case 0x93:          //---------------- FDA  Floating Divide Absolute
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
        this.togTiming = 1;             // next cycle will be Fetch by default
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
        ++this.procTime;                        // minimum alpha for Class II is 5 word-times
        this.clearControlToggles();
        this.readMemory(this.executeWithOperand);
    } else {                            // otherwise execute a non-operand instruction
        this.clearControlToggles();
        this.procTime += 3;                     // minimum Class I execution is 3 word-times

        switch (this.COP) {
        case 0x00:      //---------------- PTR  Paper-tape/keyboard read
            this.D = 0;
            this.togSTART = 1;
            this.inputReadDigit();
            break;

        case 0x01:      //---------------- CIRA Circulate A
            x = D205Processor.bcdBinary(this.CADDR % 0x20);
            this.procTime += x+8;
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
            this.procTime += 1;
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
                    this.console.writeFormatDigit(d, this.boundOutputSignDigit);
                } else {
                    this.outputSignDigit();
                }
            }
            break;

        case 0x04:      //---------------- CNZ  Change on Non-Zero
            this.procTime += 3;
            this.togZCT = 1;                            // for display only
            this.A = this.signedAdd(this.A, 0);         // clears the sign digit, among other things
            if (this.A) {
                this.togTiming = 0;                     // stay in Execute
                this.stopOverflow = 1;                  // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        // 0x05:        //---------------- (no op)

        case 0x06:      //---------------- UA   Unit Adjust
            this.procTime += 2;
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
                this.stopIdle = 1;                      // turn IDLE lamp on in case Output Knob is OFF
                d = (this.CADDR%0x1000 - this.CADDR%0x100)/0x100;
                if (d) {                                // if C8 is not zero, output it as the format digit
                    this.togOK = this.togDELAY = 1;
                    this.console.writeFormatDigit(d, this.boundOutputFinished);
                } else {
                    this.outputFinished();
                }
            }
            break;

        // 0x08:        //---------------- STOP [was handled above]

        // 0x09:        //---------------- (no op)

        case 0x10:      //---------------- DAD  Digit Add from keyboard to A
            this.togSTART = 1;
            this.procTime -= performance.now()*D205Processor.wordsPerMilli; // mark time during I/O
            this.console.readDigit(this.boundInputSingleDigit);
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
            this.procTime += 1;
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
            this.procTime += (x+1)*2;

            this.SPECIAL = x;                           // the result
            this.SHIFTCONTROL |= 0x04;                  // for display only
            this.SHIFT = 0x19;                          // for display only
            if (x < 10) {
            } else {
                this.togTiming = 0;                     // stay in Execute
                this.stopOverflow = 1;                  // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        case 0x16:      //---------------- ADSC Add Special Counter to A
            this.procTime += 3;
            this.A = this.signedAdd(this.A, this.SPECIAL);
            this.D = 0;
            this.executeComplete();
            break;

        case 0x17:      //---------------- SUSC Subtract Special Counter from A
            this.procTime += 3;
            this.D = this.SPECIAL + 0x10000000000;      // set to negative
            this.A = this.signedAdd(this.A, this.D);
            this.D = 0;
            this.executeComplete();
            break;

        case 0x18-0x19: //---------------- (no op)

        case 0x20:      //---------------- CU   Change Unconditionally
            this.procTime += 2;
            this.SHIFT = 0x15;                          // for display only
            this.SHIFTCONTROL = 0x07;                   // for display only
            this.CCONTROL = this.CADDR;                 // copy address to control counter
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.executeComplete();
            break;

        case 0x21:      //---------------- CUR  Change Unconditionally, Record
            this.procTime += 2;
            this.SHIFT = 0x15;                          // for display only
            this.SHIFTCONTROL = 0x07;                   // for display only
            this.R = this.CCONTROL*0x1000000;           // save current control counter
            this.CCONTROL = this.CADDR;                 // copy address to control counter
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.executeComplete();
            break;

        case 0x22:      //---------------- DB   Decrease B and Change on Negative
            this.procTime += 3;
            this.togADDAB = 1;                          // for display only
            this.togDELTABDIV = 1;                      // for display only
            this.togZCT = 1;                            // for display only
            this.SHIFT = 0x15;                          // for display only
            if (this.B == 0) {
                this.B = 0x9999;
            } else {
                this.B = this.bcdAdd(this.B, 0x9999) % 0x10000; // add -1
                this.togTiming = 0;                     // stay in Execute
                this.stopOverflow = 1;                  // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // display only
            this.D = 0;
            this.executeComplete();
            break;

        case 0x23:      //---------------- RO   Round A, Clear R
            this.procTime += 3;
            w = this.signedAdd(this.A%0x10000000000, (this.R < 0x5000000000 ? 0 : 1));
            this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // display only
            this.A += w - this.A%0x10000000000;
            this.R = this.D = 0;
            this.executeComplete();
            break;

        case 0x24:      //---------------- BF4  Block from 4000 Loop
        case 0x25:      //---------------- BF5  Block from 5000 loop
        case 0x26:      //---------------- BF6  Block from 6000 loop
        case 0x27:      //---------------- BF7  Block from 7000 loop
            this.procTime +=2;
            this.blockFromLoop(this.COP % 0x10, this.executeComplete);
            break;

        case 0x28:      //---------------- CC   Change Conditionally
            if (!this.stopOverflow) {                   // check if branch should occur
                this.procTime += 1;
                this.SHIFTCONTROL = 0x04;               // no -- set for display only
            } else {
                this.procTime += 2;
                this.stopOverflow = 0;                  // reset overflow and do the branch
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
                this.procTime += 2;
                this.stopOverflow = 0;                  // reset overflow and do the branch
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
            this.SHIFT = 0.15;                          // for display only
            this.SHIFTCONTROL = 0x0F;                   // for display only
            this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.blockToLoop(7, this.executeComplete);
            break;

        case 0x31:      //---------------- CUBR Change Unconditionally, Block to 7000 Loop, Record
            this.procTime += 4;
            this.SHIFT = 0.15;                          // for display only
            this.SHIFTCONTROL = 0x0F;                   // for display only
            this.R = this.CCONTROL*0x1000000;           // save current control counter
            this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.blockToLoop(7, this.executeComplete);
            break;

        case 0x32:      //---------------- IB   Increase B
            this.procTime += 3;
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
            this.procTime += 2;
            this.SHIFTCONTROL = 0x04;                   // for display only
            this.R = 0;
            this.executeComplete();
            break;

        case 0x34:      //---------------- BT4  Block to 4000 Loop
        case 0x35:      //---------------- BT5  Block to 5000 Loop
        case 0x36:      //---------------- BT6  Block to 6000 Loop
        case 0x37:      //---------------- BT7  Block to 7000 Loop
            this.procTime +=2;
            this.blockToLoop(this.COP % 0x10, this.executeComplete);
            break;

        case 0x38:      //---------------- CCB  Change Conditionally, Block to 7000 Loop
            if (!this.stopOverflow) {                   // check if branch should occur
                this.procTime += 3;
                this.SHIFTCONTROL = 0x04;               // for display only
                this.executeComplete();
            } else {
                this.procTime += 4;
                this.stopOverflow = 0;                  // reset overflow and do the branch
                this.SHIFT = 0x15;                      // for display only
                this.SHIFTCONTROL = 0x0F;               // for display only
                this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
                this.blockToLoop(7, this.executeComplete);
            }
            break;

        case 0x39:      //---------------- CCBR Change Conditionally, Block to 7000 Loop, Record
            if (!this.stopOverflow) {                   // check if branch should occur
                this.procTime += 3;
                this.SHIFTCONTROL = 0x04;               // for display only
                this.executeComplete();
            } else {
                this.procTime += 4;
                this.stopOverflow = 0;                  // reset overflow and do the branch
                this.SHIFT = 0x15;                      // for display only
                this.SHIFTCONTROL = 0x0F;               // for display only
                this.R = this.CCONTROL*0x1000000;       // save current control counter
                this.CCONTROL = this.CADDR%0x100 + 0x7000;  // set control to loop-7 address
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
                this.blockToLoop(7, this.executeComplete);
            }
            break;

        case 0x40:      //---------------- MTR  Magnetic Tape Read
            this.executeComplete();
            break;

        // 0x41:        //---------------- (no op)

        case 0x42:      //---------------- MTS  Magnetic Tape Search
            this.executeComplete();
            break;

        // 0x43:        //---------------- (no op)

        case 0x44:      //---------------- CDR  Card Read (Cardatron)
            this.executeComplete();
            break;

        case 0x45:      //---------------- CDRI Card Read Interrogate
            this.executeComplete();
            break;

        case 0x46-0x47: //---------------- (no op)

        case 0x48:      //---------------- CDRF Card Read Format
            this.executeComplete();
            break;

        // 0x49:        //---------------- (no op)

        case 0x50:      //---------------- MTW  Magnetic Tape Write
            this.executeComplete();
            break;

        // 0x51:        //---------------- (no op)

        case 0x52:      //---------------- MTRW Magnetic Tape Rewind
            this.executeComplete();
            break;

        // 0x53:        //---------------- (no op)

        case 0x54:      //---------------- CDW  Card Write (Cardatron)
            this.executeComplete();
            break;

        case 0x55:      //---------------- CDWI Card Write Interrogate
            this.executeComplete();
            break;

        // 0x56-0x57:   //---------------- (no op)

        case 0x58:      //---------------- CDWF Card Write Format
            this.executeComplete();
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
    var drumTime = performance.now()*D205Processor.wordsPerMilli;

    if (this.togCST && this.poweredOn) {
        this.procStart = drumTime;
        this.procTime = drumTime;

        this.stopIdle = 0;
        this.stopControl = 0;
        this.stopBreakpoint = 0;
        // stopOverflow, stopSector, and stopForbidden are not reset by the START button

        this.togCST = 0;
        if (this.togTiming && !this.sswLockNormal) {
            this.fetch();
        } else {
            this.togTiming = 0;
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
D205Processor.prototype.powerUp = function powerUp() {
    /* Powers up the system */

    if (!this.poweredOn) {
        this.clear();
        this.poweredOn = 1;
        this.console = this.devices.ControlConsole;
    }
};

/**************************************/
D205Processor.prototype.powerDown = function powerDown() {
    /* Powers down the system */
    var e;

    if (this.poweredOn) {
        this.stop();
        this.clear();
        this.poweredOn = 0;
        for (e in this.devices) {
            this.devices[e].shutDown();
            delete this.devices[e];
        }
    }
};

D205Processor.prototype.loadDefaultProgram = function loadDefaultProgram() {
    /* Loads a default program to the memory drum and constructs a CU at
    location 0 to branch to it */

    this.MM[   0] = 0x0000740002;       // ADD     2 -- start of counter speed test
    this.MM[   1] = 0x0000200000;       // CU      0
    this.MM[   2] = 0x0000000001;       // LIT     1

    this.MM[  10] = 0x0000360200        // BT6   200
    this.MM[  11] = 0x0000370220        // BT7   220
    this.MM[  12] = 0x0000206980        // CU   6980  branch to loop-6 entry point

    // Hello World
    this.MM[  20] = 0x0000070500;       // PTWF 0500  line feed
    this.MM[  21] = 0x0000640026;       // CAD    26
    this.MM[  22] = 0x0000030410;       // PTW  0410
    this.MM[  23] = 0x0000640027;       // CAD    27
    this.MM[  24] = 0x0000030410;       // PTW  0410
    this.MM[  25] = 0x0000089429;       // HALT 9429
    this.MM[  26] = 0x4845535356;       // LIT  "HELLO"
    this.MM[  27] = 0x6656595344;       // LIT  "WORLD"

    // Tom Sawyer's "Square Roots 100":
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
    this.MM[ 119] = 0x030505;           // PTW   0510
    this.MM[ 120] = 0x640137;           // CAD   137
    this.MM[ 121] = 0x030610;           // PTW   0010
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
    this.MM[ 137] = 0;
    this.MM[ 139] = 0x200000;

    // Tom Sawyer's "Square Roots 100" running from the loops and R cleared for division:
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
    this.MM[ 221] = 0x0000030505;       // PTW  0510
    this.MM[ 222] = 0x0000647037;       // CAD  7037
    this.MM[ 223] = 0x0000030610;       // PTW  0010
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
    this.MM[ 237] = 0;
    this.MM[ 239] = 0x0000200000;

    // Counter speed test in 4000 loop
    this.L4[   0] = 0x0000744002;       // ADD  4002 -- start of counter speed test
    this.L4[   1] = 0x0000204000;       // CU   4000
    this.L4[   2] = 0x0000000001;       // LIT     1
};