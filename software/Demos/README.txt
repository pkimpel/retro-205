Index of folder retro-205/software/Demos:
Miscellaneous demo programs for the Burroughs 205, as prepared for the
retro-205 emulator.

Unless otherwise specified, all files are in standard Windows text
format, with carriage-return/line-feed delimiters.


B205PrimeNumber-Checker.pt
    Paper tape program to accept 7-digit numbers from the console
    keyboard and determine whether or not they are prime. On the Control
    Console, set the INPUT knob to OPTICAL READER, the OUTPUT knob to
    PAGE, load the program tape, and follow the instructions printed on
    the Flexowriter.

B205PrimeNumber-Table.pt
    Paper tape program to generate a 10-up table of prime numbers on the
    Flexowriter. Set up and run the same was as for B205PrimeNumber-
    Checker.pt above. The output will look best if you set the ZERO
    SUPPRESS switch on the Flexowriter control panel to ON and the
    GROUPING/COUNTERS switch to OFF/OFF. The rest of the controls on
    that panel are ignored. The table starts at 2 and continues until
    you stop the program. It would take months of continuous running to
    overflow the 7-digit output field capacity.

B205PrimeNumber-Table--Decoded.pt
    Disassembly of the paper-tape image in B205PrimeNumber-Table.pt with
    annotations added.

Fast-Drum-Zero.card
    Card-image copy of a program found pasted in the back of Donald
    Knuth's Burroughs 205 Central Computer Handbook, as donated to the
    Computer History Museum in 2005. See:
    http://archive.computerhistory.org/resources/text/Knuth_Don_X4100/
    PDF_index/k-3-pdf/k-3-u2252-Burroughs205-centralcomputer.pdf.
    This is the program prepended to the EASY and MEASY assembler load
    decks.

Fast-Drum-Zero.pt
    Copy of Fast-Drum-Zero.card converted to load and run from paper
    tape.

Fast-Drum-Zero--Decoded.pdf
    Disassembly of the card images in Fast-Drum-Zero.card with
    annotations added.

List-Cards-to-Console-Output.card
    Card-load program to read cards from Cardatron input unit 1 under
    control of format-band 5 and print the card images to the
    Flexowriter.

List-Cards-to-Line-Printer.card
    Card-load program to read cards from Cardatron input unit 1 under
    control of format-band 5 and print the card images to Cardatron
    output unit 3 (assumed to be an IBM 407).

Square-Roots100.pt
    Paper tape program to print a table of square roots on the
    Flexowriter. Set up and run the same was as for B205PrimeNumber-
    Checker.pt above. The arithmetic is done in integer mode, and
    results are output scaled five digits to the right. Results are
    usually accurate to about four decimal places. The output will look
    best with the following settings on the Flexowriter control panel:
    ZERO SUPPRESS: ON, TAB: SPACE or TAB, GROUPING/COUNTERS: ON/ON,
    WORDS/LINE: 2, LINES/GROUP: greater than 1, GROUPS/PAGE: anything,
    AUTO STOP: as desired.

Paul Kimpel
February 2020

