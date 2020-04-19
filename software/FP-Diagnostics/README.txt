Index of folder retro-205/software/FP-Diagnostics:
Floating point diagnostic test routines for the ElectroData/Burroughs
205.

These were taken from code listings in the Burroughs Technical Manual
4113, "Floating Point Test Routine Manual Maintenance", April 3, 1957
(Training Edition), ElectroData Division of Burroughs Corporation,
Pasadena, California.

The manual was found in the CBI Burroughs Corporation archive:
"Burroughs Corporation Records (CBI 90), Charles Babbage Institute,
University of Minnesota, Minneapolis", Series 36 (ElectroData Division
records), Box 18, Folder 23.

A related document, Technical Manual 4023, "Floating Point Control Unit
Model 360 Maintenance Manual", May 15, 1957 (Preliminary Edition), was
found in the same collection: Series 36, Box 18 Folder 14.

The code for these routines was listed in a semi-assembler format -- on
each line was the 11-digit object machine word, and to its right the
memory location for the word, a repetition of the sign digit if not
zero, the assembler mnemonic for the instruction (e.g., AD for Add, op
code 74), and the operand address in decimal. Many lines also included
coments. All operands were referenced as absolute memory addresses. No
symbolic addresses were used.

These listings were transcribed as text files having a format the same
as the output listings from the 205 Shell Assembler. A script (software/
Tools/Shell-Xscript-to-Card.wsf) then extracted a source card-image file
for the Shell Assembler, and optionally, the transcribed machine words
in 205 loadable paper-tape format. Assembling the card-image file using
the retro-205 emulator produced a listing that was extracted to a text
file. For some programs, the punched-card object deck from the assembler
was also extracted. Comparing the assembler listing back to the
transcribed listing helped identify and resolve typos in the
transcription.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.

The following convention for file name extensions and suffixes was used:

.shell
    The text files transcribed from listings in TM 4113.
.card
    The card-image source files extracted from the transcribed listing
    files and used as input to the Shell Assembler.
.pt
    The object code extracted from the transcribed listing files in 205
    loadable paper-tape format.
.lst
    The assembly listings produced by the Shell Assembler.
-Load.card
    Object code card-image files produced by the Shell Assembler.

The various tests have file names taken from their code numbers
specified in TM 4113.

The diagnostic test routines consisted of a Floating Point Composite
Test (3.G00.1A) that was designed to test of all floating-point
operations and be run on a regular basis and detect malfunctions in the
Floating Point Control Unit. Based on results reported by this test, one
or more of the other "Series Test" programs would be run to further
isolate the problem. At present we do not have the Composite Test.

Series Test Routines:

3.G01.1A.*
    Floating Point Command Survey -- tests salient features of all
    floating point instructions. It requires 8 seconds per pass and 6
    minutes 35 seconds total.

3.G02.1A.*
    Floating Point vs. Fixed Point -- tests all floating point
    instructions against their fixed point counterparts. It requires 7
    seconds per pass 46 seconds total.

3.G03.1A.*
    Floating Point Normalization and Exponent Correction -- tests
    normalization and exponent adjustment on floating point op codes
    80-83. It requires 9 seconds per pass and 2 minutes 50 seconds
    total.

    This test currently reports errors under the retro-205 emulator and
    is under investigation.

3.G04.1A.*
    Floating Point Multiply Combination Test -- tests by comparing xy
    products of floating point multiply operations with corresponding yx
    products. It requires 13 minutes 0 seconds total.

3.G05.1A.*
    Floating Point Divide Combination Test -- tests by comparing results
    of (1/y)(x) with x/y. It requires 18 minutes 6 seconds.

3.G06.1A.*
    Floating Point Add-Subtract Test -- tests by comparing results of
    x+y or x-y with y+x or y-x, respectively. It requires 15 minutes 3
    seconds.

Supporting Utility Routines:

Diagnostic-Error.*
    Common error reporting routine used by all tests except the
    Composite (3.G00.1A).

Diagnostic-Error-Format-Loader.*
    Addendum to the Diagnostic-Error routine used when the test is run
    using Cardatron devices instead of paper tape and the teletype.

Input-Format-Load.*
    Addendum to the test routines used when the test is run using
    Cardatron devices instead of paper tape and the teletype.

Interpretive-Error.*
    Common error formatting routine used by all tests.

System-Error.*
    Error reporting routine used by the Composite test (3.G00.1A)
    instead of Diagnostic-Error.

System-Error-Format-Loader.*
    Addendum to the System-Error routine used when the test is run using
    Cardatron devices instead of paper tape and the teletype.

To run the Series Tests using paper tape:

     1. Load Diagnostic-Error.pt into the paper tape reader.
     2. Load the paper-tape image for the desired test into the paper
     tape reader.
     3. Load Interpretive-Error.pt into the paper tape reader.
     4. With the Console Input switch in the OPTICAL READER position,
     click the CLEAR button and then the CONT or START button.

See TM 4113 for tables that interpret the error codes output by the
tests and for instructions to use Cardatron devices instead of Console
devices.


Paul Kimpel
February 2020
