Index of folder retro-205/software/Knuth-ALGOL-58:
Source, object, and compile listings for Donald Knuth's Algol-58
compiler for the Burroughs 205, as prepared for the retro-205 emulator.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


ALGOL-58.measy
    Algol-58 compiler assembly listing transcribed by Paul Kimpel from
    http://archive.computerhistory.org/resources/text/Knuth_Don_X4100/
    PDF_index/k-2-pdf/k-2-u2435-B205-ALGOL-listing.pdf.

ALGOL-58.card
    Card deck of compiler source extracted from ALGOL-58.measy and
    formatted for input to the EASY/MEASY assembler.

Algol-58-EASY-Output.card
    Card deck output as a result of assembling the compiler from
    ALGOL-58.card using EASY-Load.card.

Algol-58-Listing-RAW.lst
    The original listing produced by assembling the compiler from
    ALGOL-58.card using MEASY-Load.card. The numeric fields in this
    listing have not been zero-suppressed they way they would have been
    coming out of the IBM 407 attached to the Cardatron, as zero
    suppression was accomplished by plugboard wiring in the 407.

Algol-58-Listing.lst
    A copy of Algol-58-Listing-RAW.lst with numeric fields zero-
    suppressed the way they would have been by the IBM 407. The zero-
    suppression is presently done by a utility script, Tools/MEASY-
    ListingZeroSuppress.wsf.

Algol-58-MEASY.tape
    Tape image output as a result of assembling the compiler from
    ALGOL-58.card using MEASY-Load.card. This tape is prefixed with the
    three-block MEASY tape loader. This image can be loaded and executed
    as follows:
        1. Load this tape image file on magnetic tape unit 4 and set the
           REMOTE/LOCAL switch to REMOTE.
        2. On the Supervisory Panel, make sure both the LOCK/NORMAL and
           CONTINUOUS/STEP switches are in the down position.
        3. On the Control Console, set the Input knob to KEYBOARD, then
           click CLEAR and then STEP.
        4. On your workstation keyboard, enter an instruction to read
           the three-block loader from tape unit 4 to address 1000:
           6 0340 40 1000. Press Enter on your keyboard.
        5. After the first three blocks are read, click CLEAR on the
           Control Console and then CONT.
        6. Enter a block-and-branch instruction on the keyboard to start
           the loader: 6 0000 30 1045. Press Enter on your keyboard.
        7. After the tape image loads, the system will halt with 7555 in
           the C register address. Place tape unit 4 in local, click
           REWIND, and once the tape is at BOT, click UNLOAD.
        8. Load a blank tape to tape unit 1 and put it in REMOTE.
        9. On the Control Console, click CLEAR and then CONT.
       10. Enter a block-and-branch instruction to start the compiler:
           6 0000 30 3040.
       11. Once the Cardatron format bands are loaded, the system will
           hang with a 44 in the C register order field. Load the card
           deck to be compiled in the card reader and click START. The
           system should resume processing. A listing will be printed on
           Cardatron output unit 3. This version of the compiler does
           not output compiled code, and does not include the run-time
           library necessary to create an executable program.

Algol-58-MEASY-Loaded.tape
    The data from Algol-58-MEASY.tape loaded to 205 memory as described
    above and then dumped back to tape. The purpose of this is to put
    the words from the original tape image in ascending address order
    and have the MEASY tape loader resolve forward references. This tape
    image was used to prepare Algol-58-MEASY-Loaded-DUMP.txt.

Algol-58-MEASY-Loaded-DUMP.txt
    The data from Algol-58-MEASY-Loaded.tape reformatted as one-word-
    per-line. The purpose of this file is to prepare the assembly output
    for the compiler object code so that it can be compared with Tom
    Sawyer's transcription of the Burroughs Algebraic Compiler load
    tape.

Sawyer-Algol58_Tape_DUMP.txt
    Object code for the first 200 blocks (not counting the loader block)
    extracted from Tom Sawyer's transcription of the Burroughs Algebraic
    Compiler load tape. This is in one-word-per-line format so it can be
    compared with Algol-58-MEASY-Loaded-DUMP.txt

Sawyer-MEASY-DUMP-Delta.pdf
    Comparison of Algol-58-MEASY-Loaded-DUMP.txt with Algol-58-MEASY-
    Loaded-DUMP.txt prepared by the Grigsoft CompareIt program. This
    shows the differences between the version of the compiler
    transcribed from Knuth's listing and the one transcribed by Tom
    Sawyer from the Burroughs Algebraic Compiler load tape. Note that
    the line numbers in this listing are one greater than the 205 memory
    address for the corresponding words. Contiguous sequences of more
    than five matching words have been suppressed in this listing.

First-Algol-58-Compile.lst
    Listing from the first attempt to compile a simple program created
    by Tom Sawyer, software/Burroughs-Algebraic-Compiler/
    Arithmetic1dollar.card. This was compiled using Algol-58-MEASY.tape.

First-Algol-58-Annotated.lst
    Copy of First-Algol-58-Compile.lst with the object code disassembled
    and annotations added.

First-Algol-58-Object.card
    Card deck output by the compiler as a result of compiling
    Arithmetic1dollar.card.

Appendix-C-Compile.lst
    Listing from the compilation of a more complex program from Appendix
    C of "The Burroughs Algebraic Compiler for the 205 Programmer's
    Manual". This was also compiled using Algol-58-MEASY.tape. The
    source can be found in software/Burroughs-Algebraic-Compiler/
    Appendix-C-Example.card.

Knuth-Test-Program/
    (moved to /retro-205/software/Burroughs-Algebraic-Compiler).


Paul Kimpel
February 2017
