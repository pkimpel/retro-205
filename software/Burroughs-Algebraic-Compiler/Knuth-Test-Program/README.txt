Index of folder retro-205/software/Knuth-ALGOL-58/Knuth-Test-Program:
Source and compile listings for Donald Knuth's test program for his
Algol-58 compiler for the Burroughs 205.

See also the folder retro-206/software/Burroughs-Algebraic-Compiler/,
which contains a later version of the compiler transcribed from a
decimal tape dump by Tom Sawyer, plus additional test programs.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


Knuth-Algol-205-Test-Program.card
    Algol-58 source for the test program, transcribed from a listing
    provided by Professor Knuth.

Knuth-Algol-205-Test-Program-BEGINEND.card
    Algol-58 source for the test program, modified by Tom Sawyer to add
    BEGIN-END pairs around each procedure declaration. This apparently
    bypasses either incorrect coding of the test program or a bug in the
    compiler Tom transcribed from the decimal tape dump -- it's hard to
    say.

Knuth-Algol-205-Test-Reformatted.card
    A copy of the transcribed card deck above, reformatted for
    readability.

Knuth-Algol-205-Test-List-Recovered.lst
    Listing of the test program, as compiled by the "recovered"
    compiler that was transcribed from Professor Knuth's listing on the
    Computer History Museum web site (see /software/Knuth-ALGOL-58/).
    This listing includes the generated object code for the program,
    less the code that would have been generated for the missing
    run-time libraries.

Knuth-Algol-205-Test-List-BEGINEND.lst
    Listing of the BEGINEND version of the test program, as compiled by
    Tom Sawyer's transcribed compiler. This listing includes the
    generated object code for the program, plus a portion of the code
    generated for the libraries. The library code is incomplete,
    however, due to the truncated listing from which it was transcribed.
    The compiler appeared to be looping during this phase, so the
    listing was arbitrarily cut off after address 4099, as at that point
    the code being generated is probably meaningless.

Knuth-Algol-205-Test-Punched-Object.card
    The object deck punched by the "recovered" compiler.


Paul Kimpel
February 2017


