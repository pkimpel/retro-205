/***********************************************************************
* retro-205/emulator D205Util.js
************************************************************************
* Copyright (c) 2014, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 emulator common Javascript utilities module.
************************************************************************
* 2014-10-04  P.Kimpel
*   Original version, from retro-b5500 B5500Util.js
***********************************************************************/
"use strict";

/**************************************/
function D205Util() {
    /* Constructor for the D205Util object */
    // Nothing to construct at present...
}

/**************************************/
D205Util.xlateASCIIToAlgolRex =         // For translation of 205-ASCII to Algol-ASCII glyphs
        /[^\r\n\xA0 $()*+,-./0-9=@A-Za-z]/g;
D205Util.xlateASCIIToAlgolGlyph = {
        "#": "=",
        "%": "(",
        "&": "+",
        "<": ")",
        "\xA4": ")"};   // the lozenge (¤)

D205Util.xlateAlgolToASCIIRex =         // For translation of Algol-ASCII glyphs to 205-ASCII
        /[^\r\n\xA0 #$%&*,-./0-9<@A-Za-z\xA4]/g;
D205Util.xlateAlgolToASCIIGlyph = {
        "=": "#",
        "(": "%",
        "+": "&",
        ")": "\xA4"};   // the lozenge (¤)

/**************************************/
D205Util.$$ = function $$(e) {
    return document.getElementById(e);
};

/**************************************/
D205Util.hasClass = function hasClass(e, name) {
    /* returns true if element "e" has class "name" in its class list */
    var classes = e.className;

    if (!e) {
        return false;
    } else if (classes == name) {
        return true;
    } else {
        return (classes.search("\\b" + name + "\\b") >= 0);
    }
};

/**************************************/
D205Util.addClass = function addClass(e, name) {
    /* Adds a class "name" to the element "e"s class list */

    if (!D205Util.hasClass(e, name)) {
        e.className += (" " + name);
    }
};

/**************************************/
D205Util.removeClass = function removeClass(e, name) {
    /* Removes the class "name" from the element "e"s class list */

    e.className = e.className.replace(new RegExp("\\b" + name + "\\b\\s*", "g"), "");
};

/**************************************/
D205Util.bindMethod = function bindMethod(context, f) {
    /* Returns a new function that binds the function "f" to the object "context" */

    return function bindMethodAnon() {f.apply(context, arguments)};
};

/**************************************/
D205Util.deepCopy = function deepCopy(source, dest) {
    /* Performs a deep copy of the object "source" into the object "dest".
    If "dest" is null or undefined, simply returns a deep copy of "source".
    Note that this routine clones the primitive Javascript types, basic
    objects (hash tables), Arrays, Dates, RegExps, and Functions. Other
    types may be supported by extending the switch statement. Also note
    this is a static function.
    Adapted (with thanks) from the "extend" routine by poster Kamarey on 2011-03-26 at
    http://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-clone-an-object
    */
    var constr;
    var copy;
    var name;

    if (source === null) {
        return source;
    } else if (!(source instanceof Object)) {
        return source;
    } else {
        constr = source.constructor;
        if (constr !== Object && constr !== Array) {
            return source;
        } else {
            switch (constr) {
            case String:
            case Number:
            case Boolean:
            case Date:
            case Function:
            case RegExp:
                copy = new constr(source);
                break;
            default:
                copy = dest || new constr();
                break;
            }

            for (name in source) {
                copy[name] = deepCopy(source[name], null);
            }

            return copy;
        }
    }
};

/**************************************/
D205Util.xlateToAlgolChar = function xlateToAlgolChar(c) {
    /* Translates one BIC-as-ASCII Algol glyph character to Unicode */

    return D205Util.xlateASCIIToAlgolGlyph[c] || "?";
};

/**************************************/
D205Util.xlateASCIIToAlgol = function xlateASCIIToAlgol(text) {
    /* Translates the BIC-as-ASCII characters in "text" to equivalent Unicode glyphs */

    return text.replace(D205Util.xlateASCIIToAlgolRex, D205Util.xlateToAlgolChar);
};

/**************************************/
D205Util.xlateToASCIIChar = function xlateToASCIIChar(c) {
    /* Translates one Unicode Algol glyph to its BIC-as-ASCII equivalent */

    return D205Util.xlateAlgolToASCIIGlyph[c] || "?";
};

/**************************************/
D205Util.xlateAlgolToASCII = function xlateAlgolToASCII(text) {
    /* Translates the Unicode characters in "text" equivalent BIC-as-ASCII glyphs */

    return text.replace(D205Util.xlateAlgolToASCIIRex, D205Util.xlateToASCIIChar);
};

/**************************************/
D205Util.xlateDOMTreeText = function xlateDOMTreeText(n, xlate) {
    /* If Node "n" is a text node, translates its value using the "xlate"
    function. For all other Node types, translates all subordinate text nodes */
    var kid;

    if (n.nodeType == Node.TEXT_NODE) {
        n.nodeValue = xlate(n.nodeValue);
    } else {
        kid = n.firstChild;
        while (kid) {
            xlateDOMTreeText(kid, xlate);
            kid = kid.nextSibling;
        }
    }
};
