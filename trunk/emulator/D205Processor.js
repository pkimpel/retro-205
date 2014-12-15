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

    // Memory
    this.memoryDrum = new ArrayBuffer(4080*8);                  // Drum: 4080 64-bit FP words
    this.MM = new Float64Array(this.memoryDrum, 0, 4000);       // Main memory, 4000 words
    this.L4 = new Float64Array(this.memoryDrum, 4000*8, 20);    // 4000 loop, 20 words
    this.L5 = new Float64Array(this.memoryDrum, 4020*8, 20);    // 5000 loop, 20 words
    this.L6 = new Float64Array(this.memoryDrum, 4040*8, 20);    // 6000 loop, 20 words
    this.L7 = new Float64Array(this.memoryDrum, 4060*8, 20);    // 7000 loop, 20 words

    // Supervisory Panel switches
    this.sswLockNormal = 0;             // Lock/Normal switch
    this.sswStepCont = 0;               // Step/Continuous switch
    this.sswAudibleAlarm = 0;           // Audible alarm

    // Control Console switches
    this.cswPOSuppress = 0;             // Print-out suppress
    this.cswSkip = 0;                   // Skip instruction
    this.cswAudibleAlarm = 0;           // Audible alarm
    this.cswOutput = 0;                 // Output knob: 0=Off, 1=Page, 2=Tape
    this.cswInput = 0;                  // Input knob: 0=Mechanical reader, 1=Optical reader, 2=Keyboard
    this.cswBreakpoint = 0;             // Breakpoint knob: 0=Off, 1, 2, 4

    this.cctContinuous = 0;             // Console step(0) / continuous(1) toggle

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

D205Processor.wordTime = 60/3570/200;   // one word time, about 84 µs at 3570rpm
D205Processor.wordsPerMilli = 1/D205Processor.wordTime/1000;
                                        // word times per millisecond (=> 142.8 KHz)
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

    this.COP = 0;                       // copy of C register op code (2 digits)
    this.CADDR = 0;                     // copy of C register operand address (4 digits)
    this.CCONTROL = 0;                  // copy of C register control address (4 digits)

    // Adder registers
    this.ADDER = 0;                     // The adder
    this.CT = 0;                        // Carry toggles for the adder

    // Operational toggles
    this.poweredOn = 0;                 // System is powered on and initialized
    this.togTiming = 0;                 // Timing toggle: 0=execute, 1=fetch
    this.togCST = 1;                    // Computer Stop toggle (?)

    // Halt/error toggles
    this.stopOverflow = 0;              // Halted due to overflow
    this.stopSector = 0;                // Halted due to sector alarm
    this.stopForbidden = 0;             // Halted due to forbidden combination
    this.stopControl = 0;               // Halted due to Stop operator (08) or overflow
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

    // Emulator control
    this.busy = 0;                      // Processor is running, not idle or halted
    this.cycleCount = 0;                // Cycle count for current syllable
    this.cycleLimit = 0;                // Cycle limit for this.run()
    this.runCycles = 0;                 // Current cycle cound for this.run()
    this.memWord = 0;                   // current word being read/written to memory
    this.successor = null;              // Current delayed-action successor function
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
    this.togADDAB = 0;                  // Add-A/add-B toggle
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
    /* Algebraically add the addend (d) to the augend (a), returning the result
    as the function value. All values are BCD with the sign in the 11th digit
    position. Sets the Overflow and Forbidden-Combination stops as necessary */
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

    // Now examine the resulting sign (still in the adder) to see if we have overflow
    // or need to recomplement the result
    if (adder == 0) {
        am += sign*0x10000000000;
    } else if (adder == 1) {
        am += (sign-1)*0x10000000000;
        this.stopOverflow = 1;
    } else { // sign is 9
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
D205Processor.prototype.readMemoryFinish = function readMemoryFinish() {
    /* Completes a read of the memory drum after an appropriate delay for drum
    latency. Moves the memory word to D, clears the memory control toggles,
    and calls the current successor function */

    this.D = this.memWord;
    this.memACCESS = this.memACTION = 0;
    this.memMAIN = this.memLM = 0;
    this.memL4 = this.memL5 = this.memL6 = this.memL7 = 0;
    this.successor();
    this.successor = null;
};

/**************************************/
D205Processor.prototype.readMemory = function readMemory(successor) {
    /* Initiates a read of the memory drum at the BCD address specified by C3-C6.
    After an appropriate delay for drum latency, the word in placed in D and
    the successor function is called. Sets the memory access toggles as necessary */
    var addr;                           // binary address, mod 8000
    var drumAddr = Math.floor(performance.now()*D205Processor.wordsPerMilli);
    var latency;                        // drum latency in word-times

    this.successor = successor;
    addr = D205Processor.bcdBinary((this.CADDR % 0x8000));
    this.memACCESS = 1;
    if (addr < 4000) {
        latency = (addr%200 - drumAddr%200 + 200)%200;
        this.memMAIN = this.memLM = 1;
        this.memWord = this.MM[addr];
    } else {
        latency = (addr%20 - drumAddr%20 + 20)%20;
        if (addr < 5000) {
            this.memL4 = 1;
            this.memWord = this.L4[addr%20];
        } else if (addr < 6000) {
            this.memL5 = 1;
            this.memWord = this.L5[addr%20];
        } else if (addr < 7000) {
            this.memL6 = 1;
            this.memWord = this.L6[addr%20];
        } else {
            this.memL7 = 1;
            this.memWord = this.L7[addr%20];
        }
    }

    this.memACTION = 1;
    setCallback("MEM", this, latency/D205Processor.wordsPerMilli, this.readMemoryFinish);
};

/**************************************/
D205Processor.prototype.writeMemoryFinish = function writeMemoryFinish(clearA) {
    /* Completes a write of the memory drum after an appropriate delay for drum
    latency. A has already been moved to the memory word, so just clears the
    memory control toggles, and calls the current successor function */

    this.memACCESS = this.memACTION = 0;
    this.memMAIN = this.memLM = 0; this.memRWM = this.memRWL = 0;
    this.memL4 = this.memL5 = this.memL6 = this.memL7 = 0;
    if (clearA) {
        this.A = 0;
    }
    this.successor();
    this.successor = null;
};

/**************************************/
D205Processor.prototype.writeMemory = function writeMemory(successor, clearA) {
    /* Initiates a write of the memory drum at the BCD address specified by C3-C6.
    After an appropriate delay for drum latency, the word in A is stored on the drum
    and the successor function is called. Sets the memory access toggles as necessary.
    If clearA is truthy, the A register is cleared at the completion of the write.
    Note: we actually store the word before the latency delay, but that is just an
    artifact of this implementation */
    var addr;                           // binary address, mod 8000
    var drumAddr = Math.floor(performance.now()*D205Processor.wordsPerMilli);
    var latency;                        // drum latency in word-times

    this.successor = successor;
    addr = D205Processor.bcdBinary((this.CADDR % 0x8000));
    this.memACCESS = 1;
    if (addr < 4000) {
        latency = (addr%200 - drumAddr%200 + 200)%200;
        this.memMAIN = this.memLM = this.memRWM = 1;
        this.MM[addr] = this.A;
    } else {
        latency = (addr%20 - drumAddr%20 + 20)%20;
        this.memRWL = 1;
        if (addr < 5000) {
            this.memL4 = 1;
            this.L4[addr%20] = this.A;
        } else if (addr < 6000) {
            this.memL5 = 1;
            this.L5[addr%20] = this.A;
        } else if (addr < 7000) {
            this.memL6 = 1;
            this.L6[addr%20] = this.A;
        } else {
            this.memL7 = 1;
            this.L7[addr%20] = this.A;
        }
    }

    this.memACTION = 1;
    setCallback("MEM", this, latency/D205Processor.wordsPerMilli, this.writeMemoryFinish, clearA);
};

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
            1 - (((this.D - this.D%0x10000000000)/0x10000000000) & 0x01);

    addr = (addr-ctl)/0x10000;                          // extract the actual address digits
    this.CCONTROL = this.serialAdd(addr, 0x0001) % 0x10000; // bump the control address modulo 10000

    addr = this.D % 0x1000000;                          // get the opcode and address digits from D
    this.D = (this.D - addr)/0x1000000;                 // shift D right six digits
    if (this.togCLEAR) {                                // check for B modification
        addr = this.serialAdd(addr, 0);                 // if no B mod, add 0 (this is actually the way it worked)
    } else {
        addr = this.serialAdd(addr, this.B) % 0x1000000;// otherwise, add B to the operand address
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
    var signDigit = ((this.D - this.D%0x10000000000)/0x10000000000) & 0x0F;

    this.togT0 = 0;                     // for display only
    this.togSIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01;
    if (this.cswBreakpoint & breakDigit) { // check for breakpoint stop
        this.togBKPT = 1;               // prepare to halt after this instruction
    }

    this.transferDtoC();
    if (this.cswSkip && (breakDigit & 0x08)) {
        this.togTiming = 1;             // stay in Fetch to skip this instruction
        if (breakDigit & 0x01) {
            this.togCST = 1;            // halt the processor
        }
    }

    // If we're not halted and either console has started in Continuous mode, continue
    if (this.togCST || !(this.sswStepContinuous || this.cctStepContinuous)) {
        this.stopIdle = 1;              // turn on IDLE lamp
    } else if (this.togTiming && !this.sswLockNormal) {
        this.fetch();                   // once more with feeling
    } else {
        this.execute();                 // execute the instruction currently in C
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

    this.togT0 = 1;                     // for display only, leave it on for this cycle
    this.togTiming = 0;                 // next cycle will be Execute by default
    this.SHIFT = 0x15;                  // for display only
    this.SHIFTCONTROL = 0x05;           // for display only

    // shift control address into operand address and initiate read
    this.CADDR = this.CCONTROL;
    this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
    this.readMemory(this.fetchComplete);  // load D from the operand address
};

/**************************************/
D205Processor.prototype.executeComplete = function executeComplete() {
    /* Implements Operation Complete (O.C.) for the Execute cycle. Determines
    if there is a stop or alarm condition, otherwise determines whether to
    do a Fetch or Execute cycle next */

    if (this.togBKPT) {
        this.togCST = 1;
        this.stopBreakpoint = 1;        // turn on BKPT lamp
    }

    if (this.togCST || !(this.sswStepContinuous || this.cctStepContinuous)) {
        this.stopIdle = 1;              // turn on IDLE lamp
    } else if (this.togTiming && !this.sswLockNormal) {
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
        break;

    case 0x61:          //---------------- Div  Divide
        break;

    // 0x62:            //---------------- (no op)
        break;

    case 0x63:          //---------------- EX   Extract
        this.A = this.serialExtract(this.A, this.D);
        this.D = 0;
        break;

    case 0x64:          //---------------- CAD  Clear and Add A
        this.A = this.serialAdd(0, this.D);
        this.D = 0;
        break;

    case 0x65:          //---------------- CSU  Clear and Subtract A
        this.A = this.serialAdd(0, this.D + 0x10000000000); // any sign overflow will be ignored
        this.D = 0;
        break;

    case 0x66:          //---------------- CADA Clear and Add Absolute
        this.A = this.serialAdd(0, this.D % 0x10000000000);
        this.D = 0;
        break;

    case 0x67:          //---------------- CSUA Clear and Subtract Absolute
        this.A = this.serialAdd(0, this.D % 0x10000000000 + 0x10000000000);
        this.D = 0;
        break;

    // 0x68-0x69:       //---------------- (no op)

    case 0x70:          //---------------- MRO  Multiply and Round
        break;

    case 0x71:          //---------------- EXC  External Control
        // at present, EXC is effectively a no op
        break;

    case 0x72:          //---------------- SB   Set B
        this.SHIFT = 0x15;                              // for display only
        this.SHIFTCONTROL = 0;                          // for display only
        this.togADDAB = 1;                              // for display only
        this.togCLEAR = 1;                              // for display only
        this.DELTABDIVT = 1;                            // for display only
        this.B = this.serialAdd(0, this.D % 0x10000);
        this.SIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // for display only
        this.D = 0;
        break;

    case 0x73:          //---------------- OSGD Overflow on Sign Difference
        this.SIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // for display, mostly
        this.stopOverflow = this.SIGN ^
                (((this.D - this.D%0x10000000000)/0x10000000000) & 0x01);
        break;

    case 0x74:          //---------------- AD   Add
        this.A = this.serialAdd(this.A, this.D);
        this.D = 0;
        break;

    case 0x75:          //---------------- SU   Subtract
        this.A = this.serialAdd(this.A, this.D + 0x10000000000); // any sign overflow will be ignored
        this.D = 0;
        break;

    case 0x76:          //---------------- ADA  Add Absolute
        this.A = this.serialAdd(this.A, this.D % 0x10000000000);
        this.D = 0;
        break;

    case 0x77:          //---------------- SUA  Subtract Absolute
        this.A = this.serialAdd(this.A, this.D % 0x10000000000 + 0x10000000000);
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

    // 0x84-0x89:       //---------------- (no op)

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

    this.CADDR = this.C % 0x100000000;  // C operand and control addresses
    this.CCONTROL = this.CADDR % 0x10000; // C control address
    this.COP = (this.C - this.CADDR)/0x100000000; // C operation code
    this.CADDR = (this.CADDR - this.CCONTROL)/0x10000;

    this.togZCT = 0;                    // for display only
    this.togT0 = 1;                     // for display only, leave it on for this cycle
    this.togTiming = 1;                 // next cycle will be Fetch by default

    if ((this.COP & 0xF8) == 0x08) {    // if STOP (08) operator or
        this.togCST = 1;                        // halt the processor
        this.stopControl = 1;                   // turn on CONTROL lamp
        this.executeComplete();
    } else if (this.stopOverflow && (this.COP & 0x08) == 0) {  // overflow and op is not a CC
        this.togCST = 1;                        // halt the processor
        this.stopControl = 1;                   // turn on CONTROL lamp
        this.executeComplete();
    } else if (this.COP >= 0x60) {      // if operator requires an operand
        this.readMemory(this.executeWithOperand);
    } else {                            // otherwise execute a non-operand instruction
        switch (this.COP) {
        case 0x00:      //---------------- PTR  Paper-tape/keyboard read
            this.executeComplete();
            break;

        case 0x01:      //---------------- CIRA Circulate A
            w = this.A;
            x = 19 - D205Processor.bcdBinary(this.CADDR % 0x20);
            this.SHIFT = D205Processor.binaryBCD(x);    // for display only
            this.togDELAY = 1;                          // for display only
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
            this.executeComplete();
            break;

        case 0x04:      //---------------- CNZ  Change on Non-Zero
            this.togZCT = 1;                            // for display only
            this.A = this.serialAdd(this.A, 0);         // clears the sign digit, among other things
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
            if (this.A % 2 == 0) {
                ++this.A;
            }
            this.executeComplete();
            break;

        case 0x07:      //---------------- PTWF Paper-tape Write Format
            this.executeComplete();
            break;

        // 0x08:        //---------------- STOP [was handled above]

        // 0x09:        //---------------- (no op)

        case 0x10:      //---------------- DAD  Digit Add from keyboard to A
            this.executeComplete();
            break;

        case 0x11:      //---------------- BA   B to A transfer
            this.togBTOAIN = 1;                         // for display only
            this.togADDAB = 1;                          // for display only
            this.togDELTABDIV = 1;                      // for display only
            this.SHIFT = 0x15;                          // for display only
            this.A = this.serialAdd(0, this.B);
            this.executeComplete();
            break;

        case 0x12:      //---------------- ST   Store A
            this.writeMemory(this.executeComplete, false);
            break;

        case 0x13:      //---------------- SR   Shift Right A
            w = this.A % 0x10000000000;                 // A sign is not affected
            x = 19 - D205Processor.bcdBinary(this.CADDR % 0x20);
            this.SHIFT = D205Processor.binaryBCD(x);    // for display only
            this.SHIFTCONTROL = 0x04;                   // for display only
            for (; x<19; ++x) {
                w = (w - w % 0x10)/0x10;
            }
            this.A += w - this.A%0x10000000000;
            this.executeComplete();
            break;

        case 0x14:      //---------------- SL   Shift Left A
            w = this.A % 0x10000000000;                 // A sign is not affected
            x = D205Processor.bcdBinary(this.CADDR % 0x20);
            this.SHIFT = D205Processor.binaryBCD(x);    // for display only
            this.SHIFTCONTROL = 0x06;                   // for display only
            for (; x<=19; ++x) {
                d = this.R % 0x10;
                this.R = (this.R - d)/0x10;
                d = (w += d*0x10000000000)%0x10;
                w = (w-d)/0x10;
                this.R += d*0x1000000000;
            }
            this.A += w - this.A%0x10000000000;
            this.executeComplete();
            break;

        case 0x15:      //---------------- NOR  Normalize A
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
            this.A += w - this.A%0x10000000000;

            this.SPECIAL = x;                           // the result
            this.SHIFTCONTROL |= 0x04;                  // for display only
            this.SHIFT = 0x19;                          // for display only
            if (x > 9) {
                this.togTiming = 0;                     // stay in Execute
                this.stopOverflow = 1;                  // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        case 0x16:      //---------------- ADSC Add Special Counter to A
            this.A = this.serialAdd(this.A, this.SPECIAL);
            this.D = 0;
            this.executeComplete();
            break;

        case 0x17:      //---------------- SUSC Subtrace Special Counter from A
            this.D = this.SPECIAL + 0x10000000000;      // set to negative
            this.A = this.serialAdd(this.A, this.D);
            this.D = 0;
            this.executeComplete();
            break;

        case 0x18-0x19: //---------------- (no op)

        case 0x20:      //---------------- CU   Change Unconditionally
            this.SHIFTCONTROL = 0x07;                   // for display only
            this.CCONTROL = this.CADDR;                 // copy address to control counter
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.executeComplete();
            break;

        case 0x21:      //---------------- CUR  Change Unconditionally, Record
            this.SHIFTCONTROL = 0x07;                   // for display only
            this.R = this.CCONTROL*0x1000000;           // save current control counter
            this.CCONTROL = this.CADDR;                 // copy address to control counter
            this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            this.executeComplete();
            break;

        case 0x22:      //---------------- DB   Decrease B and Change on Negative
            this.togADDAB = 1;                          // for display only
            this.togDELTABDIV = 1;                      // for display only
            this.togZCT = 1;                            // for display only
            this.SHIFT = 0x15;                          // for display only
            this.SIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // this too
            if (this.B == 0) {
                this.B = 0x9999;
            } else {
                this.B = this.serialAdd(this.B, 0x10000000001); // add -1
                this.togTiming = 0;                     // stay in Execute
                this.stopOverflow = 1;                  // set overflow
                this.COP = 0x28;                        // make into a CC
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.D = 0;
            this.executeComplete();
            break;

        case 0x23:      //---------------- RO   Round A
            this.A = this.serialAdd(this.A, (this.R < 0x5000000000 ? 0 : 1));
            this.R = this.D = 0;
            this.executeComplete();
            break;

        case 0x24:      //---------------- BF4  Block from 4000 Loop
            this.executeComplete();
            break;

        case 0x25:      //---------------- BF5  Block from 5000 loop
            this.executeComplete();
            break;

        case 0x26:      //---------------- BF6  Block from 6000 loop
            this.executeComplete();
            break;

        case 0x27:      //---------------- BF7  Block from 7000 loop
            this.executeComplete();
            break;

        case 0x28:      //---------------- CC   Change Conditionally
            if (!this.stopOverflow) {
                this.SHIFTCONTROL = 0x04;               // for display only
            } else {
                this.stopOverflow = 0;
                this.SHIFT = 0x15;
                this.SHIFTCONTROL = 0x07;
                this.CCONTROL = this.CADDR;             // copy address to control counter
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        case 0x29:      //---------------- CCR  Change Conditionally, Record
            if (!this.stopOverflow) {
                this.SHIFTCONTROL = 0x04;               // for display only
            } else {
                this.stopOverflow = 0;
                this.SHIFT = 0x15;
                this.SHIFTCONTROL = 0x07;
                this.R = this.CCONTROL*0x1000000;       // save current control counter
                this.CCONTROL = this.CADDR;             // copy address to control counter
                this.C = (this.COP*0x10000 + this.CADDR)*0x10000 + this.CCONTROL;
            }
            this.executeComplete();
            break;

        case 0x30:      //---------------- CUB  Change Unconditionally, Block to 7000 Loop
            this.executeComplete();
            break;

        case 0x31:      //---------------- CUBR Change Unconditionally, Block to 7000 Loop, Record
            this.executeComplete();
            break;

        case 0x32:      //---------------- IB   Increase B
            this.togADDAB = 1;                          // for display only
            this.togDELTABDIV = 1;                      // for display only
            this.togZCT = 1;                            // for display only
            this.SHIFT = 0x15;                          // for display only
            this.SIGN = ((this.A - this.A%0x10000000000)/0x10000000000) & 0x01; // this too
            this.B = this.serialAdd(this.B, 1) % 0x10000; // discard any overflow
            this.D = 0;
            this.executeComplete();
            break;

        case 0x33:      //---------------- CR   Clear R
            this.SHIFTCONTROL = 0x04;                   // for display only
            this.R = 0;
            this.executeComplete();
            break;

        case 0x34:      //---------------- BT4  Block to 4000 Loop
            this.executeComplete();
            break;

        case 0x35:      //---------------- BT5  Block to 5000 Loop
            this.executeComplete();
            break;

        case 0x36:      //---------------- BT6  Block to 6000 Loop
            this.executeComplete();
            break;

        case 0x37:      //---------------- BT7  Block to 7000 Loop
            this.executeComplete();
            break;

        case 0x38:      //---------------- CCB  Change Conditionally, Block to 7000 Loop
            this.executeComplete();
            break;

        case 0x39:      //---------------- CCB  Change Conditionally, Block to 7000 Loop, Record
            this.executeComplete();
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

        } // switch this.COP
    }
};

/**************************************/
D205Processor.prototype.start = function start() {
    /* Initiates the processor according to the current Timing Toggle state */
    var stamp = performance.now();

    this.busy = 1;
    this.procStart = stamp;
    this.procTime -= stamp;
    this.delayLastStamp = stamp;
    this.delayRequested = 0;

    this.stopIdle = 0;
    this.stopControl = 0;
    this.stopForbidden = 0;
    this.togCST = 0;
    if (this.togTiming && !this.sswLockNormal) {
        this.fetch();
    } else {
        this.togTiming = 0;
        this.execute();
    }
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
