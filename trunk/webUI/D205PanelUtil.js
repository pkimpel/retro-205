/***********************************************************************
* retro-205/emulator D205Panel.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* JavaScript object definition for the Electrodata/Burroughs Datatron 205
* Maintenance & Control Panel utility constructors.
************************************************************************
* 2014-10-04  P.Kimpel
*   Original version, from retro-b5500 B5500DDPanel.js.
***********************************************************************/

/***********************************************************************
*  Panel Lamp                                                          *
***********************************************************************/
function NeonLamp(x, y) {
    /* Constructor for the lamp objects used within panels. x & y are the
    coordinates of the lamp within its containing element */

    this.state = 0;                     // current lamp state, 0=off
    this.topCaptionDiv = null;          // optional top caption element
    this.bottomCaptionDiv = null;       // optional bottom caption element

    // visible DOM element
    this.element = document.createElement("div");
    this.element.className = NeonLamp.lampClass;
    this.element.style.left = x.toString() + "px";
    this.element.style.top = y.toString() + "px";
}

/**************************************/

NeonLamp.topCaptionClass = "neonLampTopCaption";
NeonLamp.bottomCaptionClass = "neonLampBottomCaption";
NeonLamp.lampClass = "neonLamp";
NeonLamp.litClass = "neonLamp neonLit";

/**************************************/
NeonLamp.prototype.set = function set(state) {
    /* Changes the visible state of the lamp according to the low-order
    bit of "state". */
    var newState = state & 1;

    if (this.state ^ newState) {         // the state has changed
        this.element.className = (newState ? NeonLamp.litClass : NeonLamp.lampClass);
        this.state = newState;
    }
};

/**************************************/
NeonLamp.prototype.flip = function flip() {
    /* Complements the visible state of the lamp */
    var newState = this.state ^ 1;

    this.element.className = (newState ? NeonLamp.litClass : NeonLamp.lampClass);
    this.state = newState;
};

/**************************************/
NeonLamp.prototype.setCaption = function setCaption(caption, atBottom) {
    /* Establishes an optional caption at the top of a single lamp.
    Returns the caption element */
    var e = (atBottom ? this.bottomCaptionDiv : this.topCaptionDiv);

    if (e) {
        e.textContent = caption;
    } else {
        e = document.createElement("div");
        if (atBottom) {
            this.bottomCaptionDiv = e;
            e.className = NeonLamp.bottomCaptionClass;
        } else {
            this.topCaptionDiv = e;
            e.className = NeonLamp.topCaptionClass;
        }
        e.appendChild(document.createTextNode(caption));
        this.element.appendChild(e);
    }
    return e;
};


/***********************************************************************
*  Panel Register                                                      *
***********************************************************************/
function PanelRegister(element, bits, rows, caption) {
    /* Constructor for the register objects used within panels:
        element:the DOM element (usually a <div>) within which the register will be built
        bits:   number of bits in register
        rows:   number of rows used to display the bit lamps
        caption:optional caption displayed at the bottom of the register
    */
    var cols = Math.floor((bits+rows-1)/rows);
    var b;
    var cx;
    var cy;
    var lamp;

    this.element = element;             // containing element for the panel
    this.bits = bits;                   // number of bits in the register
    this.caption = caption || "";       // panel caption
    this.lastValue = 0;                 // prior register value
    this.lamps = new Array(bits);       // bit lamps

    cx = cols*PanelRegister.hSpacing + PanelRegister.hOffset;
    for (b=0; b<bits; b++) {
        if (b%rows == 0) {
            cy = (rows-1)*PanelRegister.vSpacing + PanelRegister.vOffset;
            cx -= PanelRegister.hSpacing;
        } else {
            cy -= PanelRegister.vSpacing;
        }
        lamp = new NeonLamp(cx, cy);
        this.lamps[b] = lamp;
        this.element.appendChild(lamp.element);
    }

    this.captionDiv = document.createElement("div");
    this.captionDiv.className = PanelRegister.captionClass;
    if (caption) {
        lamp = document.createElement("span");
        lamp.className = PanelRegister.captionSpanClass;
        lamp.appendChild(document.createTextNode(caption));
        this.captionDiv.appendChild(lamp);
    }
    this.element.appendChild(this.captionDiv);
}

/**************************************/

PanelRegister.hSpacing = 32;            // horizontal lamp spacing, pixels
PanelRegister.hOffset = 14;             // horizontal lamp offset within container
PanelRegister.vSpacing = 28;            // vertical lamp spacing, pixels
PanelRegister.vOffset = 12;             // vertical lamp offset within container
PanelRegister.lampDiameter = 20;        // lamp outer diameter, pixels
PanelRegister.panelClass = "panelRegister";
PanelRegister.captionClass = "panelRegCaption";
PanelRegister.captionSpanClass = "panelRegSpan";
PanelRegister.boxCaptionClass = "boxCaption";

/**************************************/
PanelRegister.prototype.xCoord = function xCoord(col) {
    /* Returns the horizontal lamp coordinate in pixels */

    return ((col-1)*PanelRegister.hSpacing + PanelRegister.hOffset);
};

/**************************************/
PanelRegister.prototype.yCoord = function yCoord(row) {
    /* Returns the vertical lamp coordinate in pixels */

    return ((row-1)*PanelRegister.vSpacing + PanelRegister.vOffset);
};

/**************************************/
PanelRegister.prototype.panelWidth = function panelWidth(cols) {
    /* Returns the width of a register panel in pixels */

    return (cols-1)*PanelRegister.hSpacing + PanelRegister.hOffset*2 + PanelRegister.lampDiameter;
};

/**************************************/
PanelRegister.prototype.panelHeight = function panelHeight(rows) {
    /* Returns the height of a register panel in pixels */

    return (rows-1)*PanelRegister.vSpacing + PanelRegister.vOffset*2 + PanelRegister.lampDiameter;
};

/**************************************/
PanelRegister.prototype.drawBox = function drawBox(col, lamps, rows, leftStyle, rightStyle) {
    /* Creates a box centered around a specified group of lamps in a register.
    leftStyle and rightStyle specify the left and right borders of the box using
    standard CSS border syntax. Returns the box element */
    var box = document.createElement("div");
    var rightBias = (rightStyle ? 1 : 0);

    box.style.position = "absolute";
    box.style.left = (this.xCoord(col) - (PanelRegister.hSpacing-PanelRegister.lampDiameter)/2).toString() + "px";
    box.style.width = (PanelRegister.hSpacing*lamps - rightBias).toString() + "px";
    box.style.top = this.yCoord(1).toString() + "px";
    box.style.height = (this.yCoord(rows) - this.yCoord(1) + PanelRegister.lampDiameter).toString() + "px";
    box.style.borderLeft = leftStyle;
    box.style.borderRight = rightStyle;
    box.appendChild(document.createTextNode("\xA0"));
    this.element.appendChild(box);
    return box;
};

/**************************************/
PanelRegister.prototype.setBoxCaption = function setBoxCaption(box, caption) {
    /* Establishes an optional caption for register lamp box.
    Returns the caption element */
    var e = box.captionDiv;

    if (e) {
        e.textContent = caption;
    } else {
        box.captionDiv = e = document.createElement("div");
        e.className = PanelRegister.boxCaptionClass;
        e.appendChild(document.createTextNode(caption));
        box.appendChild(e);
    }
    return e;
};

/**************************************/
PanelRegister.prototype.update = function(value) {
    /* Update the register lamps from the value of the parameter */
    var bitNr = 0;
    var bit;
    var mask = Math.floor(Math.abs(value)) % 0x100000000000;

    while (bitNr < this.bits) {
        bit = mask % 2;
        this.lamps[bitNr].set(bit);
        mask = (mask-bit)/2;
        bitNr++;
    }
};
