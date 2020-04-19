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
    this.onUIClose = null;              // reference to originator's on-close callback function
    this.configData = {};               // configuration data structure

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
D205SystemConfig.prototype.configVersion = 2;
D205SystemConfig.prototype.defaultConfigName = "Default";
D205SystemConfig.prototype.flushDelay = 60000;  // flush timer setting, ms

D205SystemConfig.prototype.initialConfigData = {
    version: D205SystemConfig.prototype.configVersion,
    currentConfig: D205SystemConfig.prototype.defaultConfigName,

    configs: {
        "Default": {
            fixed: false,               // default config can be modified

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
                use204FlexCodes: false,
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
                    null,               // unit[0] not used
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
                suppressBSwitch: false, // false => off => suppress B-register modification
                units: [
                    null,               // unit[0] not used
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
        }, // Default config

        "Basic203": {
            fixed: true,                // config cannot be modified

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
                use204FlexCodes: true,
                zeroSuppressSwitch: 0,
                tabSpaceSwitch: 2,
                groupingCountersSwitch: 0,
                autoStopSwitch: 0,
                powerSwitch: 1,
                wordsKnob: 0,
                linesKnob: 0,
                groupsKnob: 0},

            Cardatron: {
                hasCardatron: false,
                units: [
                    null,                   // unit[0] not used
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"}
            ]},

            MagTape: {
                hasMagTape: false,
                suppressBSwitch: false,     // false => off => suppress B-register modification
                units: [
                    null,                   // unit[0] not used
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"},
                    {type: "NONE"}
            ]}
        } // Basic203 config
    } // configs{}
}; // initialConfigData

/**************************************/
D205SystemConfig.prototype.$$ = function $$(id) {
    return this.window.document.getElementById(id);
}

/**************************************/
D205SystemConfig.prototype.createConfigData = function createConfigData() {
    /* Creates and initializes a new configuration data object and stores it in
    localStorage */

    this.configData = {};               // start with a clean slate
    D205Util.deepCopy(this.initialConfigData, this.configData);
    this.flushHandler();
};

/**************************************/
D205SystemConfig.prototype.loadConfigData = function loadConfigData(jsonConfig) {
    /* Attempts to parse the JSON configuration data string and store it in
    this.configData. If the parse is unsuccessful, recreates the default configuration.
    Applies any necessary updates to older configurations */
    var newConfig = null;
    var oldConfig = null;
    var modified = false;
    var name = "";
    var pref = null;

    try {
        this.configData = JSON.parse(jsonConfig);
    } catch (e) {
        this.alertWin.alert("Could not parse system configuration data:\n" +
              e.message + "\nReinitializing configuration");
        this.createConfigData();
    }

    // Convert old single-config structure to new multi-config structure
    if (this.configData.version < 2) {
        modified = true;
        oldConfig = this.configData;
        this.createConfigData();
        newConfig = this.configData.configs[this.defaultConfigName];

        D205Util.deepCopy(oldConfig.SupervisoryPanel, newConfig.SupervisoryPanel);
        D205Util.deepCopy(oldConfig.ControlConsole, newConfig.ControlConsole);
        D205Util.deepCopy(oldConfig.Flexowriter, newConfig.Flexowriter);
        D205Util.deepCopy(oldConfig.Cardatron, newConfig.Cardatron);
        D205Util.deepCopy(oldConfig.MagTape, newConfig.MagTape);

        // Apply version 1 updates
        if (this.getNode("Cardatron.hasCardatron") === undefined) {
            this.putNode("Cardatron.hasCardatron", true);
        }

        if (this.getNode("MagTape.hasMagTape") === undefined) {
            this.putNode("MagTape.hasMagTape", true);
        }

        pref = this.getNode("ControlConsole.use204FlexCodes");
        if (pref !== undefined) {
            this.putNode("Flexowriter.use204FlexCodes", pref);
            this.putNode("ControlConsole.use204FlexCodes", undefined);
        }
    }

    // Apply any new initial configurations that are not in the user's config
    for (name in this.initialConfigData.configs) {
        if (!(name in this.configData.configs)) {
            modified = true;
            this.configData.configs[name] = {};
            D205Util.deepCopy(this.initialConfigData.configs[name], this.configData.configs[name]);
        }
    }

    // Make sure the current config name is valid
    if (!(this.configData.currentConfig in this.configData.configs)) {
        this.alertWin.alert("Current config name \"" + this.configData.currentConfig +
                "\" does not exist, reverting to \"" + this.defaultConfigName + "\".");
        modified = true;
        this.configData.currentConfig = this.defaultConfigName;
    }

    if (modified) {
        this.flushHandler();
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
D205SystemConfig.prototype.getConfigName = function getConfigName() {
    /* Returns the name of the current configuration */

    return this.configData.currentConfig;
};

/**************************************/
D205SystemConfig.prototype.setConfigName = function setConfigName(configName) {
    /* Attempts to set the name of the current configuration. Returns the name
    of the configuration then in effect */

    if (configName in this.configData.configs) {
        this.configData.currentConfig = configName;
        this.flushHandler();
    } else {
        this.alertWin.alert("Configuration name \"" + configName +
                "\" does not exist, reverting to \"" + this.configData.currentConfig + "\".");
    }

    return this.configData.currentConfig;
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
    var node = this.configData.configs[this.configData.currentConfig];
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
    var node = this.configData.configs[this.configData.currentConfig];
    var top;
    var x;

    if (node.fixed) {
        return;                         // not allowed to change this config
    }

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
D205SystemConfig.prototype.showConfigName = function showConfigName() {
    /* Displays the current configuration name at the bottom of the form */

    this.$$("MessageArea").textContent = "System Configuration \"" +
            this.configData.currentConfig + "\" loaded.";
};

/**************************************/
D205SystemConfig.prototype.loadConfigList = function loadConfigList() {
    /* Loads the configuration list <select> list from the current configration */
    var configs = this.configData.configs;
    var cur = this.configData.currentConfig;
    var list = this.$$("ConfigList");
    var names = Object.keys(configs).sort();
    var selected = false;
    var text = "";
    var value = "";
    var x = 0;

    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    for (x=0; x<names.length; ++x) {
        value = names[x];
        selected = (value == cur);
        text = value;
        if (configs[value].fixed) {
            text += " (non-modifiable)";
        }

        list.add(new Option(text, value, selected, selected));
    }
};

/**************************************/
D205SystemConfig.prototype.enableFormModification = function enableFormModification() {
    /* Enables or disables modification of the configuration form controls based
    on the config.fixed property */
    var cd = this.configData.configs[this.configData.currentConfig];
    var e = null;
    var elements = null;
    var fixed = cd.fixed;               // fixed/non-modifiable configuration
    var x = 0;

    elements = this.$$("ConfigPanel").querySelectorAll("*");
    for (x=0; x<elements.length; ++x) {
        e = elements[x];
        if ("disabled" in e) {
            e.disabled = fixed;
        }
    }
};

/**************************************/
D205SystemConfig.prototype.selectConfig = function selectConfig(ev) {
    /* Click event handler for the ConfigList <select> list */
    var list = ev.target;
    var index = list.selectedIndex;

    if (index >= 0) {
        this.configData.currentConfig = list.options[list.selectedIndex].value;
        this.loadConfigDialog();
    }
};

/**************************************/
D205SystemConfig.prototype.cloneConfig = function cloneConfig(ev) {
    /* Click event handler for the CLONE button */
    var configs = this.configData.configs;
    var cur = this.configData.currentConfig;
    var name = this.alertWin.prompt("Enter the name for the new configuration");

    if (name !== null) {
        name = name.trim();
        if (name.length > 0) {
            if (name in configs) {
                this.alertWin.alert("The configuration \"" + name + "\" already exists.");
            } else {
                configs[name] = {};
                D205Util.deepCopy(configs[cur], configs[name]);
                configs[name].fixed = false;
                this.configData.currentConfig = name;
                this.loadConfigList();
                // do not reload the configuration form
                this.showConfigName();
                this.enableFormModification();
                this.flushHandler();
            }
        }
    }
};

/**************************************/
D205SystemConfig.prototype.deleteConfig = function deleteConfig(ev) {
    /* Click event handler for the DELETE button */
    var configs = this.configData.configs;
    var cur = this.configData.currentConfig;

    if (configs[cur].fixed) {
        this.alertWin.alert("Cannot delete a non-modifiable configuration");
    } else if (cur == this.defaultConfigName) {
        this.alertWin.alert("Cannot delete the default configuration");
    } else if (this.alertWin.confirm("Are you sure you want to delete the \"" +
            cur + "\" configuration?")) {
        delete configs[cur];
        this.configData.currentConfig = this.defaultConfigName;
        this.loadConfigList();
        this.loadConfigDialog();
        this.flushHandler();
    }
};

/**************************************/
D205SystemConfig.prototype.closeConfigDialog = function closeConfigDialog() {
    /* Closes the configuration form window */

    this.window.close();
};

/**************************************/
D205SystemConfig.prototype.loadConfigDialog = function loadConfigDialog() {
    /* Loads the configuration UI window with the settings from this.configData */
    var cd = this.configData.configs[this.configData.currentConfig];
    var prefix;                         // unit id prefix
    var unit;                           // unit configuration object
    var x;                              // unit index

    // Control Console
    this.$$("ConsoleFlex").checked = cd.ControlConsole.hasFlexowriter;
    this.$$("ConsoleTapeReader").checked = cd.ControlConsole.hasPaperTapeReader;
    this.$$("ConsoleTapePunch").checked = cd.ControlConsole.hasPaperTapePunch;

    // Flexowriter
    this.$$("Use204FlexCodes").checked = cd.Flexowriter.use204FlexCodes;

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

    // Set form element disabled attributes based on fixed configuration
    this.enableFormModification();

    this.showConfigName();
    this.window.focus();
};

/**************************************/
D205SystemConfig.prototype.saveConfigDialog = function saveConfigDialog() {
    /* Saves the configuration UI window settings to this.configData and flushes
    the updated configuration to localStorage */
    var cd = this.configData.configs[this.configData.currentConfig];
    var e;                              // local element reference
    var prefix;                         // unit id prefix
    var unit;                           // unit configuration object
    var x;                              // unit index

    // Control Console
    cd.ControlConsole.hasFlexowriter = this.$$("ConsoleFlex").checked;
    cd.ControlConsole.hasPaperTapeReader = this.$$("ConsoleTapeReader").checked;
    cd.ControlConsole.hasPaperTapePunch = this.$$("ConsoleTapePunch").checked;

    // Flexowriter

    cd.Flexowriter.use204FlexCodes = this.$$("Use204FlexCodes").checked;

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
    this.alertWin.alert("System Configuration \"" + this.configData.currentConfig +
                "\" saved and made current.");
    this.closeConfigDialog();
};

/**************************************/
D205SystemConfig.prototype.closeConfigUI = function closeConfigUI() {
    /* Closes the system configuration update dialog */

    this.alertWin = window;             // revert alerts to the global window
    window.focus();
    if (this.window) {
        this.$$("ConfigList").removeEventListener("change",
                this.selectConfig.bind(this), false);
        this.$$("SaveBtn").removeEventListener("click",
                this.saveConfigDialog.bind(this), false);
        this.$$("CancelBtn").removeEventListener("click",
                this.closeConfigDialog.bind(this), false);
        this.$$("CloneBtn").removeEventListener("click",
                this.cloneConfig.bind(this), false);
        this.$$("DeleteBtn").removeEventListener("click",
                this.deleteConfig.bind(this), false);
        this.window.removeEventListener("unload",
                this.closeConfigUI.bind(this), false);
        if (!this.window.closed) {
            this.window.close();
        }

        this.window = null;
        if (this.onUIClose) {
            this.onUIClose(this.configData.currentConfigName);
            this.onUIClose = null;
        }
    }
}

/**************************************/
D205SystemConfig.prototype.openConfigUI = function openConfigUI(onUIClose) {
    /* Opens the system configuration update dialog and displays the current
    system configuration */

    function configUI_Load(ev) {
        this.doc = ev.target;
        this.window = this.doc.defaultView;
        this.window.moveTo(screen.availWidth-this.window.outerWidth-40,
                (screen.availHeight-this.window.outerHeight)/2);
        this.window.focus();
        this.alertWin = this.window;

        this.$$("ConfigList").addEventListener("change",
                this.selectConfig.bind(this), false);
        this.$$("SaveBtn").addEventListener("click",
                this.saveConfigDialog.bind(this), false);
        this.$$("CancelBtn").addEventListener("click",
                this.closeConfigDialog.bind(this), false);
        this.$$("CloneBtn").addEventListener("click",
                this.cloneConfig.bind(this), false);
        this.$$("DeleteBtn").addEventListener("click",
                this.deleteConfig.bind(this), false);
        this.window.addEventListener("unload",
                this.closeConfigUI.bind(this), false);

        this.loadConfigList();
        this.loadConfigDialog();
    }

    this.doc = null;
    this.window = null;
    this.onUIClose = onUIClose;
    D205Util.openPopup(window, "../webUI/D205SystemConfig.html", this.configStorageName,
            "location=no,scrollbars,resizable,width=640,height=800",
            this, configUI_Load);
};
