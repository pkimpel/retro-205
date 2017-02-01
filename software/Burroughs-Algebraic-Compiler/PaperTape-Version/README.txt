Index of folder retro-205/software/Burroughs-Algebraic-Compiler/
PaperTape-Version:
Object code for the paper-tape/Cardatron version of the Burroughs
Algebraic Compiler for the 205, as prepared for the retro-205 emulator.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


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


Paul Kimpel
February 2017

