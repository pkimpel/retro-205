/***********************************************************************
* retro-205/webUI D205SystemConfig.js
************************************************************************
* Copyright (c) 2016, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Emulator 205 System Configuration management object.
*
* Defines the system configuration used internally by the emulator and the
* methods used to manage that configuration data.
*
************************************************************************
* 2016-11-18  P.Kimpel
*   Original version, from retro-B5500 webUI/B5500SystemConfig.js.
***********************************************************************/
"use strict";

/**************************************/
function D205SystemConfig() {
    /* Constructor for the SystemConfig configuration management object */
    var s;

    this.flushTimer = 0;                // timer token for flushing configuration to localStorage
    this.window = null;                 // configuration UI window object
    this.alertWin = window;             // current base window for alert/confirm/prompt

    // Load or create the system configuration data
    s = localStorage.getItem(this.configStorageName);
    if (!s) {
        this.createConfigData();
    } else {
        this.loadConfigData(s);
    }
}

/**************************************/
D205SystemConfig.prototype.configStorageName = "retro-205-Config";
D205SystemConfig.prototype.configVersion = 1;
D205SystemConfig.prototype.flushDelay = 60000;  // flush timer setting, ms

/**************************************/
D205SystemConfig.prototype.$$ = function $$(id) {
    return this.window.document.getElementById(id);
}

/**************************************/
D205SystemConfig.prototype.createConfigData = function createConfigData() {
    /* Creates and initializes a new configuration data object and stores it in
    localStorage. If former state preference objects exist, these are merged into
    the new data object and then deleted */
    var pref;
    var prefs;
    var s;

    this.configData = {
        version: this.configVersion,

        SupervisoryPanel: {
            pulseSourceSwitch: 0,
            wordContSwitch: 0,
            frequencyKnob: 0,
            audibleAlarmSwitch: 0,
            lockNormalSwitch: 0,
            stepContinuousSwitch: 0},

        ControlConsole: {
            hasFlexowriter: true,
            hasPaperTapeReader: true,
            hasPaperTapePunch: true,
            poSuppressSwitch: 0,
            skipSwitch: 0,
            audibleAlarmSwitch: 0,
            outputKnob: 2,
            breakpointKnob: 0,
            inputKnob: 1},

        Flexowriter: {
            zeroSuppressSwitch: 0,
            tabSpaceSwitch: 2,
            groupingCountersSwitch: 0,
            autoStopSwitch: 0,
            powerSwitch: 1,
            wordsKnob: 0,
            linesKnob: 0,
            groupsKnob: 0},

        Cardatron: {
            hasCardatron: true,
            units: [
                null,                   // unit[0] not used
                {type: "CR1", formatSelect: 0, formatCol: 1},
                {type: "NONE"},
                {type: "NONE"},
                {type: "NONE"},
                {type: "LP3", algolGlyphs: true, greenBar: true,  zeroSuppressCols: ""},
                {type: "CP2", algolGlyphs: true, greenBar: false, zeroSuppressCols: ""},
                {type: "CP1", algolGlyphs: true, greenBar: false, zeroSuppressCols: ""}
                ]},

        MagTape: {
            hasMagTape: true,
            suppressBSwitch: false,     // false => off => suppress B-register modification
            units: [
                null,                   // unit[0] not used
                {type: "MTA", designate: 0, remoteSwitch: false, rewindReadySwitch: true, notWriteSwitch: false},
                {type: "NONE"},
                {type: "NONE"},
                {type: "MTD", designate: 3, remoteSwitch: false, rewindReadySwitch: true, notWriteSwitch: false},
                {type: "MTE", designate: 4, remoteSwitch: false, rewindReadySwitch: true, notWriteSwitch: false},
                {type: "NONE"},
                {type: "NONE"},
                {type: "NONE"},
                {type: "NONE"},
                {type: "NONE"}
                ]}
        };

    this.flushHandler();

    // Convert old Supervisory Panel prefs
    s = localStorage.getItem("retro-205-SupervisoryPanel-Prefs");
    if (s) {
        try {
            prefs = JSON.parse(s);
        } finally {
            // nothing
        }

        for (pref in prefs) {
            this.configData.SupervisoryPanel[pref] = prefs[pref];
        }
        this.flushHandler();
        localStorage.removeItem("retro-205-SupervisoryPanel-Prefs");
    }

    // Convert old Control Console prefs
    s = localStorage.getItem("retro-205-ControlConsole-Prefs");
    if (s) {
        try {
            prefs = JSON.parse(s);
        } finally {
            // nothing
        }

        for (pref in prefs) {
            this.configData.ControlConsole[pref] = prefs[pref];
        }
        this.flushHandler();
        localStorage.removeItem("retro-205-ControlConsole-Prefs");
    }

    // Convert old Flexowriter prefs
    s = localStorage.getItem("retro-205-Flexowriter-Prefs");
    if (s) {
        try {
            prefs = JSON.parse(s);
        } finally {
            // nothing
        }

        for (pref in prefs) {
            this.configData.Flexowriter[pref] = prefs[pref];
        }
        this.flushHandler();
        localStorage.removeItem("retro-205-Flexowriter-Prefs");
    }
};

/**************************************/
D205SystemConfig.prototype.loadConfigData = function loadConfigData(jsonConfig) {
    /* Attempts to parse the JSON configuration data string and store it in
    this.configData. If the parse is unsuccessful, recreates the default configuration.
    Applies any necessary updates to older configurations */

    try {
        this.configData = JSON.parse(jsonConfig);
    } catch (e) {
        alert("Could not parse system configuration data:\n" +
              e.message + "\nReinitializing configuration");
        this.createConfigData();
    }

    // Apply updates
    if (this.getNode("Cardatron.hasCardatron") === undefined) {
        this.putNode("Cardatron.hasCardatron", true);
    }

    if (this.getNode("MagTape.hasMagTape") === undefined) {
        this.putNode("MagTape.hasMagTape", true);
    }
};

/**************************************/
D205SystemConfig.prototype.flushHandler = function flushHandler() {
    /* Callback function for the flush timer. Stores the configuration data */

    this.flushTimer = 0;
    localStorage.setItem(this.configStorageName, JSON.stringify(this.configData));
};

/*************************************/
D205SystemConfig.prototype.flush = function flush() {
    /* If the current configuration data object has been modified, stores it to
    localStorage and resets the flush timer */

    if (this.flushTimer) {
        clearCallback(this.flushTimer);
        this.flushHandler();
    }
};

/**************************************/
D205SystemConfig.prototype.getNode = function getNode(nodeName, index) {
    /* Retrieves a specified node of the configuration data object tree.
    "nodeName" specifies the node using dotted-path format. A blank name
    retrieves the entire tree. If the "index" parameter is specified, the final
    node in the path is assumed to be an array, and "index" used to return
    that element of the array. If a node does not exist, returns undefined */
    var name;
    var names;
    var node = this.configData;
    var top;
    var x;

    name = nodeName.trim();
    if (name.length > 0) {
        names = name.split(".");
        top = names.length;
        for (x=0; x<top; ++x) {
            name = names[x];
            if (name in node) {
                node = node[name];
            } else {
                node = undefined;
                break; // out of for loop
            }
        } // for x
    }

    if (index === undefined) {
        return node;
    } else {
        return node[index];
    }
};

/**************************************/
D205SystemConfig.prototype.putNode = function putNode(nodeName, data, index) {
    /* Creates or replace a specified node of the configuration data object tree.
    "nodeName" specifies the node using dotted.path format. A blank name
    results in nothing being set. If a node does not exist, it and any necessary
    parent nodes are created. If the "index" parameter is specified, the final
    node in the path is assumed to be an array, and "index" is used to access
    that element of the array. Setting the value of a node starts a timer  (if it
    is not already started). When that timer expires, the configuration data will
    be flushed to the localStorage object. This delayed storage is done so that
    several configuration changes into short order can be grouped in one flush */
    var name;
    var names;
    var node = this.configData;
    var top;
    var x;

    name = nodeName.trim();
    if (name.length > 0) {
        names = name.split(".");
        top = names.length-1;
        for (x=0; x<top; ++x) {
            name = names[x];
            if (name in node) {
                node = node[name];
            } else {
                node = node[name] = {};
            }
        } // for x

        if (index === undefined) {
            node[names[top]] = data;
        } else {
            node[names[top]][index] = data;
        }

        if (!this.flushTimer) {
            this.flushTimer = setCallback("CONFIG", this, this.flushTimeout, this.flushHandler);
        }
    }
};

/***********************************************************************
*   System Configuration UI Support                                    *
***********************************************************************/

/**************************************/
D205SystemConfig.prototype.setListValue = function setListValue(id, value) {
    /* Sets the selection of the <select> list with the specified "id" to the
    entry with the specified "value". If no such value exists, the list
    selection is not changed */
    var e = this.$$(id);
    var opt;
    var x;

    if (e && e.tagName == "SELECT") {
        opt = e.options;
        for (x=0; x<opt.length; ++x) {
            if (opt[x].value == value) {
                e.selectedIndex = x;
                break; // out of for loop
            }
        } // for x
    }
};

/**************************************/
D205SystemConfig.prototype.loadConfigDialog = function loadConfigDialog() {
    /* Loads the configuration UI window with the settings from this.configData */
    var cd = this.configData;           // local configuration reference
    var prefix;                         // unit id prefix
    var unit;                           // unit configuration object
    var x;                              // unit index

    this.$$("ConsoleFlex").checked = cd.ControlConsole.hasFlexowriter;
    this.$$("ConsoleTapeReader").checked = cd.ControlConsole.hasPaperTapeReader;
    this.$$("ConsoleTapePunch").checked = cd.ControlConsole.hasPaperTapePunch;

    // Cardatron units
    for (x=1; x<=7; ++x) {
        unit = cd.Cardatron.units[x];
        prefix = "Cardatron" + x;
        this.setListValue(prefix + "Type", unit.type);
        switch (unit.type.substring(0, 2)) {
        case "LP":
            this.$$(prefix + "AlgolGlyphs").checked = unit.algolGlyphs;
            this.$$(prefix + "Greenbar").checked = unit.greenBar;
            this.$$(prefix + "ZeroSuppressCols").textContent = unit.zeroSuppressCols || "";
            break;
        case "CP":
            this.$$(prefix + "AlgolGlyphs").checked = unit.algolGlyphs;
            this.$$(prefix + "Greenbar").checked = false;
            this.$$(prefix + "ZeroSuppressCols").textContent = unit.zeroSuppressCols || "";
            break;
        case "CR":
        default:
            this.$$(prefix + "AlgolGlyphs").checked = false;
            this.$$(prefix + "Greenbar").checked = false;
            this.$$(prefix + "ZeroSuppressCols").textContent = "";
            break;
        } // switch unit.type
    } // for x

    // Magnetic Tape units

    this.$$("SuppressBMod").checked = !cd.MagTape.suppressBSwitch;
    for (x=1; x<=10; ++x) {
        unit = cd.MagTape.units[x];
        prefix = "MagTape" + x;
        this.setListValue(prefix + "Type", unit.type);
        this.$$(prefix + "Designate").selectedIndex = unit.designate;
        this.$$(prefix + "Remote").checked = unit.remoteSwitch;
        this.$$(prefix + "RewindReady").checked = unit.rewindReadySwitch;
        this.$$(prefix + "NotWrite").checked = unit.notWriteSwitch;
    } // for x

    this.$$("MessageArea").textContent = "205 System Configuration loaded.";
    this.window.focus();
};

/**************************************/
D205SystemConfig.prototype.saveConfigDialog = function saveConfigDialog() {
    /* Saves the configuration UI window settings to this.configData and flushes
    the updated configuration to localStorage */
    var cd = this.configData;           // local configuration reference
    var e;                              // local element reference
    var prefix;                         // unit id prefix
    var unit;                           // unit configuration object
    var x;                              // unit index

    cd.ControlConsole.hasFlexowriter = this.$$("ConsoleFlex").checked;
    cd.ControlConsole.hasPaperTapeReader = this.$$("ConsoleTapeReader").checked;
    cd.ControlConsole.hasPaperTapePunch = this.$$("ConsoleTapePunch").checked;

    // Cardatron units

    cd.Cardatron.hasCardatron = false;
    for (x=1; x<=7; ++x) {
        unit = cd.Cardatron.units[x];
        prefix = "Cardatron" + x;
        e = this.$$(prefix + "Type");
        unit.type = (e.selectedIndex < 0 ? "NONE" : e.options[e.selectedIndex].value);
        switch (unit.type.substring(0, 2)) {
        case "LP":
            cd.Cardatron.hasCardatron = true;
            unit.algolGlyphs = this.$$(prefix + "AlgolGlyphs").checked;
            unit.greenBar = this.$$(prefix + "Greenbar").checked;
            break;
        case "CP":
            cd.Cardatron.hasCardatron = true;
            unit.algolGlyphs = this.$$(prefix + "AlgolGlyphs").checked;
            unit.greenBar = false;
            break;
        case "CR":
            cd.Cardatron.hasCardatron = true;
            // no break
        default:
            unit.algolGlyphs = false;
            unit.greenBar = false;
            break;
        } // switch unit.type
    } // for x



    // Magnetic Tape units

    cd.MagTape.hasMagTape = false;
    cd.MagTape.suppressBSwitch = !this.$$("SuppressBMod").checked;

    for (x=1; x<=10; ++x) {
        unit = cd.MagTape.units[x];
        prefix = "MagTape" + x;
        e = this.$$(prefix + "Type");
        unit.type = (e.selectedIndex < 0 ? "NONE" : e.options[e.selectedIndex].value);
        unit.designate = this.$$(prefix + "Designate").selectedIndex;
        unit.remoteSwitch = this.$$(prefix + "Remote").checked;
        unit.rewindReadySwitch = this.$$(prefix + "RewindReady").checked;
        unit.notWriteSwitch = this.$$(prefix + "NotWrite").checked;
        if (unit.type != "NONE") {
            cd.MagTape.hasMagTape = true;
        }
    } // for x

    this.flushHandler();                // store the configuration
    this.$$("MessageArea").textContent = "205 System Configuration updated.";
    this.window.close();
};

/**************************************/
D205SystemConfig.prototype.closeConfigUI = function closeConfigUI() {
    /* Closes the system configuration update dialog */

    this.alertWin = window;             // revert alerts to the global window
    window.focus();
    if (this.window) {
        if (!this.window.closed) {
            this.window.close();
        }
        this.window = null;
    }
}

/**************************************/
D205SystemConfig.prototype.openConfigUI = function openConfigUI() {
    /* Opens the system configuration update dialog and displays the current
    system configuration */

    function configUI_Load(ev) {
        this.doc = ev.target;
        this.window = this.doc.defaultView;
        this.window.moveTo(screen.availWidth-this.window.outerWidth-40,
                (screen.availHeight-this.window.outerHeight)/2);
        this.window.focus();
        this.alertWin = this.window;
        this.$$("SaveBtn").addEventListener("click",
                this.saveConfigDialog.bind(this), false);
        this.$$("CancelBtn").addEventListener("click",
                function(ev) {this.window.close()}.bind(this), false);
        this.window.addEventListener("unload",
                this.closeConfigUI.bind(this), false);
        this.loadConfigDialog();
    }

    this.doc = null;
    this.window = null;
    D205Util.openPopup(window, "../webUI/D205SystemConfig.html", this.configStorageName,
            "location=no,scrollbars,resizable,width=640,height=800",
            this, configUI_Load);
};
