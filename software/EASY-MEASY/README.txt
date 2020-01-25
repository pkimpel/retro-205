Index of folder retro-205/software/EASY-MEASY:
Source, object, and listing files for Donald Knuth's EASY and MEASY
assemblers for the Burroughs 205, as prepared for the retro-205
emulator.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


EASY.card
    Source deck for the EASY assembler transcribed by Paul Kimpel from:
    http://archive.computerhistory.org/resources/text/Knuth_Don_X4100/
    PDF_index/k-2-pdf/k-2-u2435-EASY-doc.pdf.
    The symbol table and initialization code were taken from:
    http://archive.computerhistory.org/resources/text/Knuth_Don_X4100/
    PDF_index/k-2-pdf/k-2-c1037-EASY.pdf.
    The following corrections to this transcription were made:
        1. On line 129 (address 1733), the assembled operand address was
           corrected from 0000 to 4756.
        2. On line 304 (address 1478), the program point operand "0+"
           was inserted (had been zero-suppressed on the listing).
        3. On line 425 (address 2712), the encoding for the BF7 op code
           was changed from 4246860007 to 4246870007.
        4. On lines 558-561 (addresses 1203-1206), the BTn instructions
           were changed to BFn to avoid overwriting the assembled
           contents of the high-speed loops.
        4. Added entries for magnetic tape instructions to the symbol
           table.
        5. Placed a "1" in column 1 of each card image for use as a
           Cardatron format-band select digit.

EASY-Load.card
    Card deck to load and execute EASY. This deck is in the standard
    format band 6 layout for the 205 Cardatron. It was extracted from
    the object code on the right side of the lines in EASY.card, but
    adjusted afterwards as follows:
        1. A short clear-memory program was prepended to the deck.
           See Demos/Fast-Drum-Zero.card.
        2. Added entries for magnetic tape instructions to the symbol
           table.
        3. Impose reload-lockout on the last card (so that the first
           card of the program to be assembled would not be read before
           the assembler's format bands had been loaded.
        4. Branch to the entry point of the program at address 1200 upon
           completion of the load.

EASY-Output.card
    Card deck output as a result of assembling EASY from EASY.card using
    EASY-Load.card.

EASY-Output-Load.card
    A copy of EASY-Output.card that was modified to prepend a short
    clear-memory program (see Demos/Fast-Drum-Zero.card). The loader
    halts with 1221 in the C register address when load is complete.
    The assembler can be then run by branching to its entry point,
    address 1200.

EASY-Annotated-Listing.doc
    Annotated version of EASY.card in Microsoft Word for Windows 2000
    format. Describes in some detail the operation of the EASY
    assembler.

EASY-Annotated-Listing.pdf
    EASY-Annotated-Listing.doc output in Adobe Acrobat PDF format.

MEASY.card
    Source deck for the MEASY assembler, transcribed by Paul Kimpel
    from:
    http://archive.computerhistory.org/resources/text/Knuth_Don_X4100/
    PDF_index/k-2-pdf/k-2-u2435-MEASY-doc.pdf
    and validated against:
    http://archive.computerhistory.org/resources/text/Knuth_Don_X4100/
    PDF_index/k-2-pdf/k-2-c1038-MEASY.pdf.
    Note that the assembled object code was relocated to the right side
    of the card images to match the format of the EASY.card
    transcription, and a "1" was inserted in column 1 for Cardatron
    format-band selection.

MEASY-Output.card
    Card deck output as a result of assembling MEASY from MEASY.card
    using EASY-Load.card.

MEASY-Output.txt
    A copy of MEASY-Output-card that was modified as follows:
        1. Object code on the right side of the card image was
           reformatted to match that of MEASY.card so that the two files
           could be compared more easily.
        2. The majority of the numeric fields were zero-suppressed so
           that this file could be compared to MEASY.card more easily.
        3. The "6" in column 2 was changed to a space, also to aid
           comparison with MEASY.card.
        4. The card images for the loader and forward-address reference
           table at the end were reformatted to delimit the words with
           spaces for readability.

MEASY-Load.card
    A standard format-6 card load deck that was derived from MEASY-
    Output.card as follows:
        1. The short clear-memory program was prepended to this deck.
        2. An extra dummy card was appended to the end in lieu of
           imposing reload-lockout for the last card of the loader deck.
           This prevents the first card of the deck being assembled from
           being read before MEASY can load format bands to the
           Cardatron.
        3. The HLT 1221 at the end of the loader was replaced by a CUB
           1048 to automatically run the assembler at completion of the
           load.

MEASY-Output.tape
    Tape image in retro-205 emulator format, output as a result of
    assembling MEASY from MEASY.card using MEASY-Load.card. This image
    can be loaded and executed as follows:
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
        8. Load a blank tape to tape unit 4 and put it in REMOTE.
        9. On the Control Console, click CLEAR and then CONT.
       10. Enter a block-and-branch instruction to start the assembler:
           6 0000 30 1048.
       11. Once the Cardatron format bands are loaded, the system will
           hang with a 44 in the C register order field. Load the card
           deck to be assembled in the card reader and click START. The
           system should resume processing and write the assembled code
           to tape unit 4. A listing will be printed on Cardatron output
           unit 3. Tape unit 4 will rewind once assembly is complete.

MEASY-Listing-RAW.lst
    The original listing produced by assembling MEASY from MEASY.card
    using MEASY-Load.card. The numeric fields in this listing have not
    been zero-suppressed they way they would have been coming out of the
    IBM 407 attached to the Cardatron, as zero suppression was
    accomplished by plugboard wiring in the 407.

MEASY-Listing.lst
    A copy of MEASY-Listing-RAW.lst with numeric fields zero-suppressed
    the way they would have been by the IBM 407. The zero-suppression is
    presently done by a utility script, Tools/MEASY-
    ListingZeroSuppress.wsf.

Winter-PI-EASY.card
    Source in EASY/MEASY assembler format for a port of Dik Winter's C
    program to compute the first 800 digits of Pi and print them on the
    Flexowriter. See software/Shell-Assembler/Shell-Utilities/README.txt
    for details.

Winter-PI-EASY-Load.card
    Assembled output from EASY of Winter-PI-EASY.card. Load from a
    Cardatron reader with the format band select for column 2.


Paul Kimpel
March 2018
