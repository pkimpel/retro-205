Index of folder retro-205/software/Burroughs-Algebraic-Compiler/tests:
Sample and test programs for the Burroughs Algebraic Compiler for the
205, as prepared for the retro-205 emulator.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


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

FLOAT-Test.card
    A small Algol program to test the fixed-to-float conversion library
    intrinsic function. This program requires Tom Sawyer's corrections
    to the tape overlay transcription of 31 January 2017.

FLOAT-Test.lst
    Compiler listing produced from FLOAT-Test.card.


Paul Kimpel
February 2017


