/***********************************************************************
* retro-205/webUI D205Util.js
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
D205Util.popupOpenDelayIncrement = 250; // increment for pop-up open delay adjustment, ms
D205Util.popupOpenDelay = 500;          // current pop-up open delay, ms
D205Util.popupOpenQueue = [];           // queue of pop-up open argument objects


/**************************************/
D205Util.xlateASCIIToAlgolRex =         // For translation of 205-ASCII to Algol-ASCII glyphs
        /[^\r\n\xA0 $()*+,-./0-9=@A-Za-z]/g;
D205Util.xlateASCIIToAlgolGlyph = {
        "#": "=",
        "%": "(",
        "&": "+",
        "<": ")",
        "\u00A4": ")"};         // the lozenge (¤)

D205Util.xlateAlgolToASCIIRex =         // For translation of Algol-ASCII glyphs to 205-ASCII
        /[^\r\n\xA0 #$%&*,-./0-9<@A-Za-z\xA4]/g;
D205Util.xlateAlgolToASCIIGlyph = {
        "=": "#",
        "(": "%",
        "+": "&",
        ")": "\u00A4"};         // the lozenge (¤)

/**************************************/
D205Util.$$ = function $$(e) {
    return document.getElementById(e);
};

/**************************************/
D205Util.hasClass = function hasClass(e, name) {
    /* returns true if element "e" has class "name" in its class list */

    return e.classList.contains(name);
};

/**************************************/
D205Util.addClass = function addClass(e, name) {
    /* Adds a class "name" to the element "e"s class list */

    e.classList.add(name);
};

/**************************************/
D205Util.removeClass = function removeClass(e, name) {
    /* Removes the class "name" from the element "e"s class list */

    e.classList.remove(name);
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
    var constr = null;
    var copy = null;
    var name = "";

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
    var kid = null;

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

/**************************************/
D205Util.openPopup = function openPopup(parent, url, windowName, options, context, onload) {
    /* Schedules the opening of a pop-up window so that browsers such as Apple
    Safari (11.0+) will not block the opens if they occur too close together.
    Parameters:
        parent:     parent window for the pop-up
        url:        url of window context, passed to window.open()
        windowName: internal name of the window, passed to window.open()
        options:    string of window options, passed to window.open()
        context:    object context ("this") for the onload function (may be null)
        onload:     event handler for the window's onload event (may be null).
    If the queue of pending pop-up opens in D205Util.popupOpenQueue[] is empty,
    then attempts to open the window immediately. Otherwise queues the open
    parameters, which will be dequeued and acted upon after the previously-
    queued entries are completed by D205Util.dequeuePopup() */

    D205Util.popupOpenQueue.push({
        parent: parent,
        url: url,
        windowName: windowName,
        options: options,
        context: context,
        onload: onload});
    if (D205Util.popupOpenQueue.length == 1) { // queue was empty
        D205Util.dequeuePopup();
    }
};

/**************************************/
D205Util.dequeuePopup = function dequeuePopup() {
    /* Dequeues a popupOpenQueue[] entry and attempts to open the pop-up window.
    Called either directly by D205Util.openPopup() when an entry is inserted
    into an empty queue, or by setTimeout() after a delay. If the open fails,
    the entry is reinserted into the head of the queue, the open delay is
    incremented, and this function is rescheduled for the new delay. If the
    open is successful, and the queue is non-empty, then this function is
    scheduled for the current open delay to process the next entry in the queue */
    var entry = D205Util.popupOpenQueue.shift();
    var loader1 = null;
    var loader2 = null;
    var win = null;

    if (entry) {
        try {
            win = entry.parent.open(entry.url, entry.windowName, entry.options);
        } catch (e) {
            win = null;
        }

        if (!win) {                     // window open failed, requeue
            D205Util.popupOpenQueue.unshift(entry);
            D205Util.popupOpenDelay += D205Util.popupOpenDelayIncrement;
            setTimeout(D205Util.dequeuePopup, D205Util.popupOpenDelay);
            //console.log("Pop-up open failed: " + entry.windowName + ", new delay=" + D205Util.popupOpenDelay + "ms");
        } else {                        // window open was successful
            if (entry.onload) {
                loader1 = entry.onload.bind(entry.context);
                win.addEventListener("load", loader1, false);
            }

            loader2 = function(ev) {    // remove the load event listeners after loading
                win.removeEventListener("load", loader2, false);
                if (loader1) {
                    win.removeEventListener("load", loader1, false);
                }
            };

            win.addEventListener("load", loader2, false);
            if (D205Util.popupOpenQueue.length > 0) {
                setTimeout(D205Util.dequeuePopup, D205Util.popupOpenDelay);
            }
        }
    }
};