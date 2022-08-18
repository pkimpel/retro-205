Index of folder retro-205/software/Burroughs-Algebraic-Compiler:
Object code and sample programs for the Burroughs Algebraic Compiler for
the 205, as prepared for the retro-205 emulator.

See also the folder retro-206/software/Knuth-Algol-58/, which contains
an earlier version of the compiler transcribed from a scanned listing by
Paul Kimpel.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


Algol58_Tape_TomSawyer.tape
    Tape image for the Burroughs Algebraic Compiler as transcribed from
    a numeric tape dump by Tom Sawyer and converted to retro-205
    emulator format. This tape can be loaded and the compiler run in two
    ways:

    A. Manual setup:
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
        9. Load the card deck to be compiled in the card reader
           (Cardatron input unit 1) and click START. The system should
           resume processing and write the compiled code to tape unit 1.
           A listing will be printed on Cardatron output unit 3.
       10. The compiler should eventually halt with 7570 in the C-
           register address field.
       11. If the program compiled successfully, it can be run
           immediately by clicking CONT. Otherwise, the program can be
           loaded and run from the output tape on unit 1 using the
           Algol58_Program_Loader.card deck.

    B. Using the compiler bootstrap loader:
        1. Perform steps 1 to 4 from the manual setup instructions
           above.
        2. Load the one-card compiler bootstrap (Algol58_Tape_Loader.
           card) in the card reader.
        3. Perform steps 9 to 11 from the manual setup instructions
           above.

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

Algol58_Tape_Loader_TomSawyer.pt
    A short paper-tape bootstrap program to load and execute the
    Burroughs Algebraic Compiler from Algol58_Tape_TomSawyer.tape.

Algol58_Tape_Loader.card
    A a card-based bootstrap program to load and execute the
    Burroughs Algebraic Compiler from Algol58_Tape_TomSawyer.tape.

Algol58_Program_Loader.card
    A card-based bootstrap program to clear memory and load the object
    code for an Algol program compiled to tape on unit 1.

PaperTape-Version/
    Directory containing a version of the compiler adapted by Tom Sawyer
    for paper tape input and Cardatron output.

Knuth-Test-Program/
    Card decks and listing for a program to test the Algol-58 compiler.
    A copy of the original listing was kindly provided to the project
    by Professor Knuth. See the README.txt file in this folder for
    details.

tests/
    Directory containing various sample and test programs for the
    compiler. See the README.txt file within this directory for details.


Paul Kimpel
August 2022

