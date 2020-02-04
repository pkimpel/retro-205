/***********************************************************************
* retro-205/webUI D205.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Emulator top page routines.
************************************************************************
* 2015-01-17  P.Kimpel
*   Original version, extracted from D205.html.
* 2020-02-04  P.Kimpel
*   Remove deprecated Application Cache (appcache) configuration.
***********************************************************************/
"use strict";

window.addEventListener("load", function() {
    var config = new D205SystemConfig();// system configuration object
    var devices = {};                   // hash of I/O devices for the Processor
    var diagWindow = null;              // handle for the diagnostic monitor panel
    var processor;                      // the Processor object
    var statusMsgTimer = 0;             // status message timer control cookie

    /**************************************/
    function systemShutDown() {
        /* Powers down the Processor and shuts down all of the panels and I/O devices */
        var e;

        processor.powerDown();
        for (e in devices) {
            if (devices[e]) {
                devices[e].shutDown();
                devices[e] = null;
            }
        }

        if (diagWindow && !diagWindow.closed) {
            diagWindow.close();
        }

        processor = null;
        document.getElementById("StartUpBtn").disabled = false;
        document.getElementById("StartUpBtn").focus();
        document.getElementById("ConfigureBtn").disabled = false;
        config.flush();
    }

    /**************************************/
    function systemStartup(ev) {
        /* Establishes the system components */
        var u;
        var x;

        ev.target.disabled = true;
        document.getElementById("ConfigureBtn").disabled = true;

        processor = new D205Processor(config, devices);
        devices.ControlConsole = new D205ControlConsole(processor);

        if (config.getNode("Cardatron.hasCardatron")) {
            devices.CardatronControl = new D205CardatronControl(processor);
        } else {
            devices.CardatronControl = null;
        }

        if (config.getNode("MagTape.hasMagTape")) {
            devices.MagTapeControl = new D205MagTapeControl(processor);
        } else {
            devices.MagTapeControl = null;
        }

        // Supervisory panel must be instantiated last
        devices.SupervisoryPanel = new D205SupervisoryPanel(processor, systemShutDown);
    }

    /**************************************/
    function configureSystem(ev) {
        /* Opens the system configuration UI */

        config.openConfigUI();
    }

    /**************************************/
    function clearStatusMsg(inSeconds) {
        /* Delays for "inSeconds" seconds, then clears the StatusMsg element */

        if (statusMsgTimer) {
            clearTimeout(statusMsgTimer);
        }

        statusMsgTimer = setTimeout(function(ev) {
            document.getElementById("StatusMsg").textContent = "";
            statusMsgTimer = 0;
        }, inSeconds*1000);
    }

    /**************************************/
    function openDiagPanel(ev) {
        /* Opens the emulator's diagnostic monitor panel in a new sub-window */
        var global = window;

        D205Util.openPopup(window, "D205DiagMonitor.html", "DiagPanel",
                "resizable,width=300,height=500,left=0,top=" + screen.availHeight-500,
                this, function(ev) {
            diagWindow = ev.target.defaultView;
            diagWindow.global = global; // give it access to our globals.
            diagWindow.focus();
        });
    }

    /**************************************/
    function checkBrowser() {
        /* Checks whether this browser can support the necessary stuff */
        var missing = "";

        if (!window.ArrayBuffer) {missing += ", ArrayBuffer"}
        if (!window.DataView) {missing += ", DataView"}
        if (!window.Blob) {missing += ", Blob"}
        if (!window.File) {missing += ", File"}
        if (!window.FileReader) {missing += ", FileReader"}
        if (!window.FileList) {missing += ", FileList"}
        if (!window.JSON) {missing += ", JSON"}
        if (!window.localStorage) {missing += ", LocalStorage"}
        if (!window.indexedDB) {missing += ", IndexedDB"}
        if (!window.postMessage) {missing += ", window.postMessage"}
        if (!(window.performance && "now" in performance)) {missing += ", performance.now"}
        if (!window.Promise) {missing += ", Promise"}

        if (missing.length == 0) {
            return true;
        } else {
            alert("The emulator cannot run...\n" +
                "your browser does not support the following features:\n\n" +
                missing.substring(2));
            return false;
        }
    }

    /***** window.onload() outer block *****/

    document.getElementById("StartUpBtn").disabled = true;
    document.getElementById("EmulatorVersion").textContent = D205Processor.version;
    if (checkBrowser()) {
        document.getElementById("Retro205Logo").addEventListener("dblclick", openDiagPanel, false);
        document.getElementById("StartUpBtn").disabled = false;
        document.getElementById("StartUpBtn").addEventListener("click", systemStartup, false);
        document.getElementById("StartUpBtn").focus();
        document.getElementById("ConfigureBtn").disabled = false;
        document.getElementById("ConfigureBtn").addEventListener("click", configureSystem, false);

        document.getElementById("StatusMsg").textContent = "The Application Cache feature has been deimplemented";
        clearStatusMsg(30);
    }
});
