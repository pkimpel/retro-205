/***********************************************************************
* retro-205/emulator D205Panel.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* JavaScript object definition for the ElectroData/Burroughs Datatron 205
* Maintenance & Control Panel utility constructors.
************************************************************************
* 2014-10-04  P.Kimpel
*   Original version, from retro-b5500 B5500DDPanel.js.
***********************************************************************/

/***********************************************************************
*  Panel Neon Lamp                                                     *
***********************************************************************/
function NeonLamp(element, x, y, id) {
    /* Constructor for the neon lamp objects used within panels. x & y are the
    coordinates of the lamp within its containing element; id is the DOM id */

    this.state = 0;                     // current lamp state, 0=off
    this.topCaptionDiv = null;          // optional top caption element
    this.bottomCaptionDiv = null;       // optional bottom caption element

    // visible DOM element
    this.element = document.createElement("div");
    this.element.id = id;
    this.element.className = NeonLamp.lampClass;
    if (x !== null) {
        this.element.style.left = x.toString() + "px";
    }
    if (y !== null) {
        this.element.style.top = y.toString() + "px";
    }

    if (element) {
        element.appendChild(this.element);
    }
}

/**************************************/

NeonLamp.topCaptionClass = "neonLampTopCaption";
NeonLamp.bottomCaptionClass = "neonLampBottomCaption";
NeonLamp.lampClass = "neonLamp";
NeonLamp.litClass = "neonLamp neonLit";

/**************************************/
NeonLamp.prototype.set = function set(state) {
    /* Changes the visible state of the lamp according to the low-order
    bit of "state" */
    var newState = state & 1;

    if (this.state ^ newState) {         // the state has changed
        this.state = newState;
        this.element.className = (newState ? NeonLamp.litClass : NeonLamp.lampClass);
    }
};

/**************************************/
NeonLamp.prototype.flip = function flip() {
    /* Complements the visible state of the lamp */
    var newState = this.state ^ 1;

    this.state = newState;
    this.element.className = (newState ? NeonLamp.litClass : NeonLamp.lampClass);
};

/**************************************/
NeonLamp.prototype.setCaption = function setCaption(caption, atBottom) {
    /* Establishes an optional caption at the top or bottom of a single lamp.
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
*  Panel Colored Lamp                                                  *
***********************************************************************/
function ColoredLamp(element, x, y, id, offClass, onClass) {
    /* Constructor for the colored lamp objects used within panels. x & y are
    the coordinates of the lamp within its containing element; id is the DOM id */

    this.state = 0;                     // current lamp state, 0=off
    this.topCaptionDiv = null;          // optional top caption element
    this.bottomCaptionDiv = null;       // optional bottom caption element
    this.lampClass = offClass;          // css styling for an "off" lamp
    this.litClass =                     // css styling for an "on" lamp
                offClass + " " + onClass;
    this.levelClass = [                 // css class names for the lamp levels
            offClass,
            this.litClass + "1",
            this.litClass + "2",
            this.litClass + "3",
            this.litClass + "4",
            this.litClass + "5",
            this.litClass];

    // visible DOM element
    this.element = document.createElement("div");
    this.element.id = id;
    this.element.className = offClass;
    if (x !== null) {
        this.element.style.left = x.toString() + "px";
    }
    if (y !== null) {
        this.element.style.top = y.toString() + "px";
    }

    if (element) {
        element.appendChild(this.element);
    }
}

/**************************************/

ColoredLamp.lampLevels = 6;
ColoredLamp.topCaptionClass = "coloredLampTopCaption";
ColoredLamp.bottomCaptionClass = "coloredLampBottomCaption";

/**************************************/
ColoredLamp.prototype.set = function set(state) {
    /* Changes the visible state of the lamp according to the low-order
    bit of "state" */
    var newState = Math.round(Math.max(Math.min(state, 1), 0)*ColoredLamp.lampLevels);

    if (this.state != newState) {       // the state has changed
        this.state = newState;
        this.element.className = this.levelClass[newState];
    }
};

/**************************************/
ColoredLamp.prototype.flip = function flip() {
    /* Complements the visible state of the lamp */

    this.set(ColoredLamp.lampLevels - this.state);
};

/**************************************/
ColoredLamp.prototype.setCaption = function setCaption(caption, atBottom) {
    /* Establishes an optional caption at the top or bottom of a single lamp.
    Returns the caption element */
    var e = (atBottom ? this.bottomCaptionDiv : this.topCaptionDiv);

    if (e) {
        e.textContent = caption;
    } else {
        e = document.createElement("div");
        if (atBottom) {
            this.bottomCaptionDiv = e;
            e.className = ColoredLamp.bottomCaptionClass;
        } else {
            this.topCaptionDiv = e;
            e.className = ColoredLamp.topCaptionClass;
        }
        e.appendChild(document.createTextNode(caption));
        this.element.appendChild(e);
    }
    return e;
};


/***********************************************************************
*  Panel Toggle Switch                                                 *
***********************************************************************/
function ToggleSwitch(element, x, y, id, offImage, onImage) {
    /* Constructor for the toggle switch objects used within panels. x & y are
    the coordinates of the switch within its containing element; id is the DOM id */

    this.state = 0;                     // current switch state, 0=off
    this.topCaptionDiv = null;          // optional top caption element
    this.bottomCaptionDiv = null;       // optional bottom caption element
    this.offImage = offImage;           // image used for the off state
    this.onImage = onImage;             // image used for the on state

    // visible DOM element
    this.element = document.createElement("img");
    this.element.id = id;
    this.element.src = offImage;
    if (x !== null) {
        this.element.style.left = x.toString() + "px";
    }
    if (y !== null) {
        this.element.style.top = y.toString() + "px";
    }

    if (element) {
        element.appendChild(this.element);
    }
}

/**************************************/

ToggleSwitch.topCaptionClass = "toggleSwitchTopCaption";
ToggleSwitch.bottomCaptionClass = "toggleSwitchBottomCaption";

/**************************************/
ToggleSwitch.prototype.set = function set(state) {
    /* Changes the visible state of the switch according to the low-order
    bit of "state" */
    var newState = state & 1;

    if (this.state ^ newState) {         // the state has changed
        this.state = newState;
        this.element.src = (newState ? this.onImage : this.offImage);
    }
};

/**************************************/
ToggleSwitch.prototype.flip = function flip() {
    /* Complements the visible state of the switch */
    var newState = this.state ^ 1;

    this.state = newState;
    this.element.src = (newState ? this.onImage : this.offImage);
};

/**************************************/
ToggleSwitch.prototype.setCaption = function setCaption(caption, atBottom) {
    /* Establishes an optional caption at the top or bottom of a single switch.
    Returns the caption element */
    var e = (atBottom ? this.bottomCaptionDiv : this.topCaptionDiv);

    if (e) {
        e.textContent = caption;
    } else {
        e = document.createElement("div");
        if (atBottom) {
            this.bottomCaptionDiv = e;
            e.className = ToggleSwitch.bottomCaptionClass;
        } else {
            this.topCaptionDiv = e;
            e.className = ToggleSwitch.topCaptionClass;
        }
        e.appendChild(document.createTextNode(caption));
        this.element.appendChild(e);
    }
    return e;
};


/***********************************************************************
*  Panel Three-way Toggle Switch                                       *
***********************************************************************/
function ThreeWaySwitch(element, x, y, id, offImage, onImage1, onImage2) {
    /* Constructor for the three-way toggle switch objects used within panels.
    x & y are the coordinates of the switch within its containing element;
    id is the DOM id */

    this.state = 0;                     // current switch state, 0=off
    this.topCaptionDiv = null;          // optional top caption element
    this.bottomCaptionDiv = null;       // optional bottom caption element
    this.offImage = offImage;           // image used for the off state
    this.onImage1 = onImage1;           // image used for the lower on state
    this.onImage2 = onImage2;           // image used for the upper on state

    // visible DOM element
    this.element = document.createElement("img");
    this.element.id = id;
    this.element.src = offImage;
    if (x !== null) {
        this.element.style.left = x.toString() + "px";
    }
    if (y !== null) {
        this.element.style.top = y.toString() + "px";
    }

    if (element) {
        element.appendChild(this.element);
    }
}

/**************************************/

ThreeWaySwitch.topCaptionClass = "ToggleSwitchTopCaption";
ThreeWaySwitch.bottomCaptionClass = "ToggleSwitchBottomCaption";

/**************************************/
ThreeWaySwitch.prototype.set = function set(state) {
    /* Changes the visible state of the switch according to the value
    of "state" */

    if (this.state != state) {          // the state has changed
        switch (state) {
        case 1:
            this.state = 1;
            this.element.src = this.onImage1;
            break;
        case 2:
            this.state = 2;
            this.element.src = this.onImage2;
            break;
        default:
            this.state = 0;
            this.element.src = this.offImage;
            break;
        } // switch state
    }
};

/**************************************/
ThreeWaySwitch.prototype.flip = function flip() {
    /* Increments the visible state of the switch */

    this.set(this.state+1);
};

/**************************************/
ThreeWaySwitch.prototype.setCaption = function setCaption(caption, atBottom) {
    /* Establishes an optional caption at the top or bottom of a single switch.
    Returns the caption element */
    var e = (atBottom ? this.bottomCaptionDiv : this.topCaptionDiv);

    if (e) {
        e.textContent = caption;
    } else {
        e = document.createElement("div");
        if (atBottom) {
            this.bottomCaptionDiv = e;
            e.className = ThreeWaySwitch.bottomCaptionClass;
        } else {
            this.topCaptionDiv = e;
            e.className = ThreeWaySwitch.topCaptionClass;
        }
        e.appendChild(document.createTextNode(caption));
        this.element.appendChild(e);
    }
    return e;
};


/***********************************************************************
*  Black Control Knob                                                  *
***********************************************************************/
function BlackControlKnob(element, x, y, id, initial, positions) {
    /* Constructor for the black control knob objects used within panels. x & y are
    the coordinates of the knob within its containing element; id is the DOM id;
    initial is the 0-relative index indicating the default position of the switch;
    positions is an array indicating the angular position (in degrees, where 0
    is straight up) of each of the knob's positions */

    this.position = 0;                  // current knob position
    this.topCaptionDiv = null;          // optional top caption element
    this.bottomCaptionDiv = null;       // optional bottom caption element
    this.positions = positions;         // array of knob position angles

    // visible DOM element
    this.element = document.createElement("canvas");
    this.element.id = id;
    this.element.width = BlackControlKnob.size;
    this.element.height = BlackControlKnob.size;
    this.element.className = BlackControlKnob.className;
    if (x !== null) {
        this.element.style.left = x.toString() + "px";
    }
    if (y !== null) {
        this.element.style.top = y.toString() + "px";
    }

    if (element) {
        element.appendChild(this.element);
    }

    this.set(initial);                  // set to its initial position
}

/**************************************/

BlackControlKnob.topCaptionClass = "blackControlKnobTopCaption";
BlackControlKnob.bottomCaptionClass = "blackControlKnobBottomCaption";
BlackControlKnob.className = "blackControlKnob1";
BlackControlKnob.size = 64;             // width/height in pixels

/**************************************/
BlackControlKnob.prototype.set = function set(position) {
    /* Changes the visible state of the knob according to the position index */
    var dc = this.element.getContext("2d");
    var degrees = Math.PI/180;
    var fullCircle = 360*degrees;
    var halfSize = Math.floor(BlackControlKnob.size/2);
    var quarterSize = Math.floor(BlackControlKnob.size/4);
    var silverSkirt;

    if (position < 0) {
        this.position = 0;
    } else if (position < this.positions.length) {
        this.position = position;
    } else {
        this.position = this.positions.length-1;
    }

    dc.save();
    dc.translate(halfSize+0.5, halfSize+0.5);   // move origin to the center

    dc.fillStyle = "#246";                      // fill in the panel background (aids antialiasing)
    dc.fillRect(-halfSize, -halfSize, BlackControlKnob.size, BlackControlKnob.size);

    silverSkirt = dc.createRadialGradient(0, 0, halfSize, 0, 0, quarterSize);
    silverSkirt.addColorStop(0.5, "#FFF");
    silverSkirt.addColorStop(1, "#CCC");

    dc.beginPath();                             // draw the outer skirt of the knob
    dc.arc(0, 0, halfSize-1, 0, fullCircle, false);
    dc.fillStyle = silverSkirt;
    dc.fill();

    dc.beginPath();                             // draw the central knob
    dc.arc(0, 0, quarterSize, 0, fullCircle, false);
    dc.fillStyle = "#000";
    dc.fill();

    dc.beginPath();                             // draw the inset on top of the knob
    dc.arc(0, 0, quarterSize-4, 0, fullCircle, false);
    dc.fillStyle = "#333";
    dc.fill();

    dc.save();                                  // draw the knob indicator
    dc.rotate(this.positions[this.position]*degrees);
    dc.beginPath();
    dc.moveTo(0, -halfSize);
    dc.lineTo(-quarterSize/4, -halfSize+quarterSize/2);
    dc.lineTo(quarterSize/4, -halfSize+quarterSize/2);
    dc.closePath();
    dc.fillStyle = "#000";
    dc.fill();
    dc.restore();                               // undo the rotation
    dc.restore();                               // undo the translation
};

/**************************************/
BlackControlKnob.prototype.step = function step() {
    /* Steps the knob to its next position. If it is at the last position, steps it
    to the first position */
    var position = this.position+1;

    if (position < this.positions.length) {
        this.set(position);
    } else {
        this.set(0);
    }
};

/**************************************/
BlackControlKnob.prototype.setCaption = function setCaption(caption, atBottom) {
    /* Establishes an optional caption at the top or bottom of a single switch.
    Returns the caption element */
    var e = (atBottom ? this.bottomCaptionDiv : this.topCaptionDiv);

    if (e) {
        e.textContent = caption;
    } else {
        e = document.createElement("div");
        if (atBottom) {
            this.bottomCaptionDiv = e;
            e.className = blackControlKnob.bottomCaptionClass;
        } else {
            this.topCaptionDiv = e;
            e.className = blackControlKnob.topCaptionClass;
        }
        e.appendChild(document.createTextNode(caption));
        this.element.appendChild(e);
    }
    return e;
};


/***********************************************************************
*  Panel Register                                                      *
***********************************************************************/
function PanelRegister(element, bits, rows, idPrefix, caption) {
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
        this.lamps[b] = lamp = new NeonLamp(element, cx, cy, idPrefix + b.toString());
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
PanelRegister.vOffset = 14;             // vertical lamp offset within container
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
PanelRegister.prototype.update = function update(value) {
    /* Update the register lamps from the value of the parameter. This routine
    compares the value of the register that was previously updated against the new
    one in an attempt to minimize the number of lamp flips that need to be done */
    var bitBase = 0;
    var bitNr;
    var lastMask;
    var lastValue = this.lastValue;
    var thisMask;
    var thisValue = Math.floor(Math.abs(value)) % 0x100000000000;

    if (thisValue != lastValue) {
        this.lastValue = thisValue;     // save it for next time
        do {
            // Loop through the masks 30 bits at a time so we can use Javascript bit ops
            bitNr = bitBase;
            lastMask = lastValue % 0x40000000;              // get the low-order 30 bits
            lastValue = (lastValue-lastMask)/0x40000000;    // shift the value right 30 bits
            thisMask = thisValue % 0x40000000;              // ditto for the second value
            thisValue = (thisValue-thisMask)/0x40000000;

            lastMask ^= thisMask;       // determine which bits have changed
            while (lastMask) {
                if (lastMask & 0x01) {
                    this.lamps[bitNr].set(thisMask & 0x01);
                }
                if (++bitNr <= this.bits) {
                    lastMask >>>= 1;
                    thisMask >>>= 1;
                } else {
                    thisValue = thisMask = 0;
                    lastValue = lastMask = 0;
                    break;              // out of inner while loop
                }
            }

            bitBase += 30;
        } while (thisValue || lastValue);
    }
};
