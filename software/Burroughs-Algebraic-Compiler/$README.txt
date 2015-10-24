Index of folder retro-205/software/Burroughs-Algebraic-Compiler:
Object code and sample programs for the Burroughs Algebraic Compiler for
the 205, as prepared for the retro-205 emulator.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


Algol58_Tape_TomSawyer.tape
    Tape image for the Burroughs Algebraic Compiler as transcribed from
    a numeric tape dump by Tom Sawyer and converted to retro-205
    emulator format. This tape can be loaded and executed as follows:
        1. Load this tape image file on magnetic tape unit 5 and set the
           REMOTE/LOCAL switch to REMOTE.
        2. Load a blank tape to tape unit 1 and put it in REMOTE.
        3. On the Supervisory Panel, make sure both the LOCK/NORMAL and
           CONTINUOUS/STEP switches are in the down position.
        4. On the Control Console, set the Input knob to KEYBOARD, then
           click CLEAR and then STEP.
        5. On your workstation keyboard, enter an instruction to read
           the one-block loader from tape unit 5 to address 0000:
           6 0150 40 0000. Press Enter on your keyboard.
        6. After the first block is read, click CLEAR on the
           Control Console and then CONT.
        7. Enter a block-and-branch instruction on the keyboard to start
           the loader: 6 0000 30 0000. Press Enter on your keyboard.
        8. After the tape image loads, the compiler will initialize and
           after several seconds hang with a CDR (44) in the C-register
           order field.
        9. Load the card deck to be compiled in the card reader and
           click START. The system should resume processing and write
           the compiled code to tape unit 1. A listing will be printed
           on Cardatron output unit 3.
       10. The compiler should eventually halt with 7570 in the C-
           register address field.

Algol58_Tape_Annotated_TomSawyer.xls
    Microsoft Excel spreadsheet prepared by Tom Sawyer from his
    transcription of the Burroughs Algebraic Compiler load tape and
    partially annotated. This contains only the main compiler, not the
    overlay for the subroutine library.

Algol58_Tape_Annotated_TomSawyer.txt
    Text-only version of the spreadsheet above.

Algol58_Tape_RAW_TomSawyer.txt
    Raw, decimal, one-word-per-line version of the Burroughs Algebraic
    Compiler as transcribed by Tom Sawyer. This includes the overlay for
    the subroutine library.

Algol58_Tape_Overlay_TomSawyer.xls
    Microsft Excel spreadsheet prepared by Tom Sawyer from his
    transcription of the Burroughs Algebraic Compiler load tape. This
    contains only the overlay for the subroutine library.

Algol58_Tape_Overlay_TomSawyer.txt
    Text-only version of the overlay spreadsheet above.

Algol58_Subroutine-Library-RAW.txt
    Raw, decimal, one-word-per-line version of the Burroughs Algebraic
    Compiler as transcribed by Tom Sawyer. This contains only the
    overlay for the subroutine library.

Algol58_Subroutine-Library-DISASM.measy
    Very basic disassembly of the code from Algol58_Subroutine-Library-
    RAW.txt in MEASY transcription format (a work in progress). This
    contains only the overlay for the subroutine library.

Algol58_Reconstructed.card
    Source deck for the Burroughs Algebraic Compiler reconstructed from
    software/Knuth-ALGOL-58/ALGOL-58.card with the differences from
    software/Knuth-ALGOL-58/Sawyer-MEASY-DUMP-Delta.pdf manually
    inserted (a work in progress).

Arithmetic1dollar.card
    Source deck for a simple Algol program created by Tom Sawyer.

Arithmetic1dollar-Compile.lst
    Listing produced by compiling Arithmetic1dollar.card using
    Algol58_Tape_TomSawyer.tape.

Arithmetic1dollar.tape
    Tape image of object code produced by compiling
    Arithmetic1dollar.card using Algol58_Tape_TomSawyer.tape.

Appendix-C-Example.card
    Source deck for a more complex Algol program, from Appendix C of
    "The Burroughs Algebraic Compiler for the 205 Programmer's Manual"
    on page 34.

Appendix-C-Example.lst
    Listing from the compilation of the more complex program above. This
    was also compiled using Algol58_Tape_TomSawyer.tape. Note that the
    compiler does not complete compiling this program. It loops during
    processing of the subroutine library overlay, probably due to the
    incompleteness of that overlay.

Algol58_Tape_Loader_TomSawyer.pt
    A short paper-tape bootstrap program to load and execute the
    Burroughs Algebraic Compiler from Algol58_Tape_TomSawyer.tape.

B205AlgolPaperTape.pt
    Copy of Algol58_Tape_TomSawyer.tape modified by Tom Sawyer to load
    and execute the Burroughs Algebraic Compiler from paper tape.
    Program text is also read from paper tape, and a listing is created
    on the Console output device (Flexowriter or paper-tape punch). The
    compiled program will be written to magnetic tape unit 1. Tom
    generated this version of the compiler as a stopgap before Cardatron
    and magnetic tape devices were available in the emulator. It no
    longer works properly if tape devices are configured in the system.
    This file is the main part of the compiler. To run it:
        1. On the Supervisory Panel, make sure the LOCK/NORMAL and
           CONTINUOUS/STEP switches are both in the down position.
        2. On the Control Console, set the OUTPUT knob to PAGE or TAPE
           as preferred, and the INPUT knob to OPTICAL READER.
        3. Load a blank tape to magnetic tape units 1 and 5, and place
           both the drives in REMOTE.
        4. Load this file into the paper-tape reader.
        5. On the Control Console, click CLEAR and then CONT. This file
           should load, and then the system with halt with 0001 in the C
           register address field.
        6. Load the paper tape containing your program text into the
           paper-tape reader and click CONT on the Control Console. The
           compiler will read the program and list it on the selected
           output device. Generated instructions will also be listed on
           this device. The system will halt with 0001 in the C register
           address field after each "line" of the program, except the
           last. Load more tape if necessary, then click CONT to
           continue.
        7. After the FINISH$ statement in you program is encountered,
           the compiler will halt with 0003 in the C register address
           field.
        8. Load the B205AlgolPaperTapeOverlay.pt file into the paper-
           tape reader and click CONT on the Control Console. The
           overlay should load, and additional instructions should list
           on the selected output device.
        9. The compiler should halt when finished with 7570 in the C
           register address field.

B205AlgolPaperTape-Cardatron-In.pt
    Another stopgap version of the compiler prepared by Tom Sawyer. This
    one works the same as B205AlgolPaperTape.pt, except that the source
    program is read from Cardatron input unit 1.

B205AlgolPaperTape-Cardatron-IO.pt
    A third stopgap version of the compiler prepared by Tom Sawyer. This
    one works the same as B205AlgolPaperTape-Cardatron-In.pt, except
    that the compile listing is output to Cardatron input unit 3.

B205AlgolPaperTapeOverlay.pt
    Paper tape version of the compiler overlay to be used with
    B205AlgolPaperTape.pt, B205AlgolPaperTape-Cardatron-In.pt, and
    B205AlgolPaperTape-Cardatron-IO.pt.

Algol58Program1.pt
    A simple, one-line Algol program to demonstrate the use of paper
    tape: "X=40$ Y=50$ X1=X + Y + 3.14$STOP$FINISH$".

Algol58Program1-Compiler-Output.txt
    Output printed to the Flexowriter from compiling Algol58Program1.pt
    with B205AlgolPapterTape.pt.

Algol58Arithmetic2.pt
    A two-line Algol program in paper-tape format:
    "X=40$Y=50$Z=60$W=80$X1=X + Y + 3.14.X + 7.98/Z + (X-Y).(X+Z)$",
    "X2=X-Y$X3=X.Y$X4=X/Z$STOP$FINISH$".
    Paper tape programs must be written in decimal, with the words for
    each "line" in reverse order. At the end of each line, there must be
    a tape command (60000203652) to return control to the compiler so it
    can process that line.


Paul Kimpel
October 2015
