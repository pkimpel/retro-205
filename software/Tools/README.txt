Index of folder retro-205/software/Tools:
Source for miscellaneous utility scripts used to prepare and convert
transcription and assembler output files for the retro-205 emulator.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.

Files with a ".wsf" extension refer to Windows Script Files. Unless
otherwise specified, all of these use Microsoft VBScript as the
scripting language. See the individual scripts for instructions for
their use.


Algol-58-LoadImageReformatter.wsf
    Reads a tape image dumped from a memory image of the Algol-58
    compiler object code, after the compiler has been assembled by MEASY
    and loaded to memory using the MEASY loader. This puts the object
    words in their proper memory locations and fixes up any forward
    reference linkages. The memory image from the tape is then written
    in decimal, one word per line, to the output text file. The primary
    purpose of this program is to prepare the output of the MEASY
    assembly of the transcribed compiler source so it can be compared
    with Tom Sawyer's transcription of his Burroughs Algebraic Compiler
    decimal tape dump.

Algol-58-OverlayDeckBuilder.wsf
    Generates a 205 card-load deck from a one-word-per-line text file.
    The purpose of this program is to create a card-load deck from the
    tape image of the subroutine library section of Tom Sawyer's
    transcription of the Burroughs Algebraic Compiler tape. This was
    done in an attempt to supply at least a partial library overlay
    (read from cards) to the version of the compiler transcribed from
    Knuth's listing donated to Computer History Museum.

EASY-LoadDeckBuilder.wsf
    Generates a 205 card-load deck from the list/punch output of Knuth's
    EASY assembler. The punch output of EASY is directly loadable as is,
    but it has a one-word-per-card format. This utility converts that to
    standard 205 load-deck format, which has up to six words per card
    image.

EASY-OutputDeckReformatter.wsf
    Reformats the list/punch output of Knuth's EASY assembler so that it
    matches the format of the listings he donated to the Computer
    History Museum, and which have been transcribed to text files on
    this site (see files with a ".easy" extension). The purpose of
    reformatting the list/punch output is to put it in a form that it
    can be mechanically compared to the transcribed files for proofing
    purposes.

MEASY-ListingZeroSuppress.wsf
    Applies zero-suppression to fields in a MEASY output listing. Zero
    suppression ends in 1-relative columns 4, 9, 34, 42, 43, 66, 69.
    This was used to prepare line-printer output from MEASY (which was
    not zero-suppressed) so it could be more easily compared with the
    transcription of scans of MEASY-generated listings.

Shell-LoadTapeBuilder.wsf
    Extracts object code from the Shell Assembler output tapes created
    by assembling the transcribed source code of the assembler itself.
    It reads the output tape images for the first and second movements,
    then  outputs a tape image containing the loadable object code for
    the assembled assembler. The original use of this utility was to
    prepare output of the assembler assembling itself for a "round-trip"
    test. Note that the assembler object code is placed on lane 1 of the
    tape starting at block 120.

Shell-Xscript-Reformatter.wsf
    Extracts source and object code from the Shell Assembler
    transcriptions. It reads the transcription files for the first and
    second movements, then outputs:
        1. An assembler card deck for the first movement's source.
        2. An assembler card deck for the second movement's source.
        3. A tape image containing the loadable object code for the
        assembler. Note that the assembler object code is placed on lane
        1 of the tape starting at block 120.

Simple-Disassembler.wsf
    Reads a text file containing one 205 decimal word per line, format
    the line in the canonical 1-4-3-4 object code notation, and do a
    very simple-minded disassembly of each word in MEASY listing format.
    The original purpose of this script was to convert Tom Sawyer's
    transcription of the Burroughs Algebraic Compiler tape dump into a
    form that could be used for further study and annotation.


Paul Kimpel
January 2016

