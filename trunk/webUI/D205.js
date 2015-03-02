/***********************************************************************
* retro-205/D205.js
************************************************************************
* Copyright (c) 2015, Paul Kimpel.
* Licensed under the MIT License, see
*       http://www.opensource.org/licenses/mit-license.php
************************************************************************
* ElectroData/Burroughs Datatron 205 Emulator top page routines.
************************************************************************
* 2015-01-17  P.Kimpel
*   Original version, extracted from D205.html.
***********************************************************************/
"use strict";

window.addEventListener("load", function() {
    var devices = {};                   // hash of I/O devices for the Processor
    var p;                              // the Processor object
    var statusMsgTimer = 0;             // status message timer control cookie

    /**************************************/
    function systemShutDown() {
        /* Powers down the Processor and shuts down all of the panels and I/O devices */
        var e;

        p.powerDown();
        p = null;
        for (e in devices) {
            devices[e].shutDown();
            devices[e] = null;
        }
        document.getElementById("StartUpBtn").disabled = false;
    }

    /**************************************/
    function systemStartup(ev) {
        /* Establishes the system components */

        p = new D205Processor(devices);
        devices.ControlConsole = new D205ControlConsole(p);
        devices.SupervisoryPanel = new D205SupervisoryPanel(p, systemShutDown);
        devices.CardatronControl = new D205CardatronControl("CCU");
        ev.target.disabled = true;
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
        /* Opens the emulator's diagnostic panel in a new sub-window */
        var win;

        win = window.open("D205DiagMonitor.html", "DiagPanel",
                "location=no,scrollbars=no,resizable,width=300,height=500,top=0,left=0");
        win.global = window;            // give it access to our globals.
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
        if (!window.localStorage) {missing += ", window.localStorage"}
        if (!window.postMessage) {missing += ", window.postMessage"}
        if (!(window.performance && "now" in performance)) {missing += ", performance.now"}

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
        document.getElementById("Retro205Logo").addEventListener("dblclick", openDiagPanel);
        document.getElementById("StartUpBtn").disabled = false;
        document.getElementById("StartUpBtn").addEventListener("click", systemStartup);
        document.getElementById("StartUpBtn").focus();

        window.applicationCache.addEventListener("checking", function(ev) {
            document.getElementById("StatusMsg").textContent = "Checking for emulator update...";
            clearStatusMsg(15);
        });
        window.applicationCache.addEventListener("noupdate", function(ev) {
            document.getElementById("StatusMsg").textContent = "Emulator version is current.";
            clearStatusMsg(15);
        });
        window.applicationCache.addEventListener("obsolete", function(ev) {
            document.getElementById("StatusMsg").textContent = "Emulator off-line installation has been disabled.";
            clearStatusMsg(15);
        });
        window.applicationCache.addEventListener("downloading", function(ev) {
            document.getElementById("StatusMsg").textContent = "Initiating download for emulator update...";
            clearStatusMsg(15);
        });
        window.applicationCache.addEventListener("progress", function(ev) {
            var text = (ev.loaded && ev.total ? ev.loaded.toString() + "/" + ev.total.toString() : "Unknown number of");
            document.getElementById("StatusMsg").textContent = text + " resources downloaded thus far...";
            clearStatusMsg(15);
        });
        window.applicationCache.addEventListener("updateready", function(ev) {
            document.getElementById("StatusMsg").textContent = "Emulator update completed. Reload this page to activate the new version.";
            clearStatusMsg(15);
        });
        window.applicationCache.addEventListener("cached", function(ev) {
            document.getElementById("StatusMsg").textContent = "Emulator is now installed for off-line use.";
            clearStatusMsg(15);
        });
        window.applicationCache.addEventListener("error", function(ev) {
            document.getElementById("StatusMsg").textContent = "Browser reported error during emulator version check.";
            clearStatusMsg(15);
        });
    }
});
