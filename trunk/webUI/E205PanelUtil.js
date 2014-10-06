 /***********************************************************************
* retro-205/emulator 205Panel.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see http://www.opensource.org/licenses/mit-license.php
************************************************************************
* JavaScript object definition for the 205 Maintenance & Control Panel
* utility constructors.
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
    this.captionDiv = null;             // optional caption element

    // visible DOM element
    this.element = document.createElement("div");
    this.element.className = NeonLamp.lampClass;
    this.element.style.left = x.toString() + "px";
    this.element.style.top = y.toString() + "px";
}

/**************************************/

NeonLamp.captionClass = "neonLampCaption";
NeonLamp.lampClass = "neonLamp";
NeonLamp.litClass = "neonLit";

/**************************************/
NeonLamp.prototype.set = function(state) {
    /* Changes the visible state of the lamp according to the low-order
    bit of "state". */
    var newState = state & 1;

    if (this.state ^ newState) {         // the state has changed
        this.element.className = (newState ? NeonLamp.lampClass + " " + NeonLamp.litClass : NeonLamp.lampClass);
        this.state = newState;
    }
}

/**************************************/
NeonLamp.prototype.flip = function() {
    /* Complements the visible state of the lamp */
    var newState = this.state ^ 1;

    this.element.className = (newState ? NeonLamp.lampClass + " " + NeonLamp.litClass : NeonLamp.lampClass);
    this.state = newState;
}

/**************************************/
NeonLamp.prototype.setCaption = function(caption) {
    /* Establishes an optional caption for a single lamp */
    var e = this.captionDiv;

    if (e) {
        e.textContent = caption;
    } else {
        this.captionDiv = e = document.createElement("div");
        e.className = NeonLamp.captionClass;
        e.appendChild(document.createTextNode(caption));
        this.element.appendChild(e);
    }
}


/***********************************************************************
*  Panel Register                                                      *
***********************************************************************/
function PanelRegister(bits, x, y, rows, caption) {
    /* Constructor for the register objects used within panels:
        bits:   number of bits in register
        x:      horizontal coordinate of upper-left corner lamp [hSpacing increments]
        y:      vertical coordinate of upper-left corner lamp [vSpacing increments]
        rows:   number of rows used to display the bit lamps
    */
    var cols = Math.floor((bits+rows-1)/rows);
    var height = (rows-1)*PanelRegister.vSpacing + PanelRegister.vOffset*2 + PanelRegister.lampDiameter;
    var width = (cols-1)*PanelRegister.hSpacing + PanelRegister.hOffset*2 + PanelRegister.lampDiameter;
    var b;
    var cx = x*PanelRegister.hSpacing - PanelRegister.hOffset;
    var cy = y*PanelRegister.vSpacing - PanelRegister.vOffset;
    var lamp;

    this.bits = bits;                   // number of bits in the register
    this.left = cx;                     // horizontal offset relative to container
    this.top = cy;                      // vertical offset relative to container
    this.caption = caption || "";       // panel caption
    this.lastValue = 0;                 // prior register value
    this.lamps = new Array(bits);       // bit lamps

    // visible DOM element
    this.element = document.createElement("div");
    this.element.className = PanelRegister.panelClass;
    this.element.style.left = cx.toString() + "px";
    this.element.style.top = cy.toString() + "px";
    this.element.style.width = width.toString() + "px";
    this.element.style.height = height.toString() + "px";

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
    //this.captionDiv.style.top = String(-PanelRegister.vOffset) + "px";
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

/**************************************/
PanelRegister.prototype.xCoord = function(col) {
    /* Returns the horizontal lamp coordinate in "px" format */

    return String((col-1)*PanelRegister.hSpacing + PanelRegister.hOffset) + "px";
}

/**************************************/
PanelRegister.prototype.yCoord = function(row) {
    /* Returns the vertical lamp coordinate in "px" format */

    return String((row-1)*PanelRegister.vSpacing + PanelRegister.vOffset) + "px";
}

/**************************************/
PanelRegister.prototype.YYupdate = function(value) {
    /* Update the register lamps from the value of the parameter */
    var bitNr = 0;
    var low = (this.lastValue % 0x1000000) ^ (value % 0x1000000);
    var high = (Math.floor(this.lastValue / 0x1000000) % 0x1000000) ^ (Math.floor(value / 0x1000000) % 0x1000000);

    while (low) {
        bitNr++;
        if (low & 1) {
            this.lamps[bitNr].flip();
        }
        low >>>= 1;
    }
    bitNr = 23;
    while (high) {
        bitNr++;
        if (high & 1) {
            this.lamps[bitNr].flip();
        }
        high >>>= 1;
    }
    this.lastValue = value;
}

/**************************************/
PanelRegister.prototype.XXupdate = function(value) {
    /* Update the register lamps from the value of the parameter */
    var bitNr = 0;
    var bit;
    var mask = value % 0x1000000000000;

    while (mask) {
        bitNr++;
        bit = mask % 2;
        this.lamps[bitNr].set(bit);
        mask = (mask-bit)/2;
    }
}

/**************************************/
PanelRegister.prototype.update = function(value) {
    /* Update the register lamps from the value of the parameter */
    var bitNr = 0;
    var bit;
    var mask = Math.floor(Math.abs(value)) % 0x1000000000000;

    while (bitNr < this.bits) {
        bit = mask % 2;
        this.lamps[bitNr].set(bit);
        mask = (mask-bit)/2;
        bitNr++;
    }
}
