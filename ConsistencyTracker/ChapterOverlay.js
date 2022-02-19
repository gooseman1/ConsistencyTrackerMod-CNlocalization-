let settings = {};
let defaultSettings = {
    "attempts": "20",
    "text-format-left": "GB Deaths<br>Room: {room:goldenDeaths}<br>Session: {chapter:goldenDeathsSession}<br>Total: {chapter:goldenDeaths}",
    "text-format-center": "{checkpoint:name}-{checkpoint:roomNumber}: {room:rate}% ({room:successes}/{room:attempts})<br>CP: {checkpoint:rate}%<br>Total: {chapter:rate}%",
    "text-format-right": "Golden Chance<br>CP: {checkpoint:goldenChance}%<br>Total: {chapter:goldenChance}%<br>Room➔End: {run:roomToEndGoldenChance}",
    "text-nan-replacement": "-",
    "color": "white",
    "font-size-left": "32px",
    "font-size-center": "40px",
    "font-size-right": "25px",
    "outline-size": "10px",
    "outline-color": "black",
    "refresh-time-ms": 1000,
    "light-green-cutoff": 0.95,
    "green-cutoff": 0.8,
    "yellow-cutoff": 0.5,
    "chapter-bar-enabled": true,
    "font-family": "Renogare",
    "golden-chance-decimals": 4,
    "golden-share-display-enabled": true,
    "golden-share-font-size": "28px",
    "golden-share-style-percent": false,
    "golden-share-show-current-session": true,
    "room-attempts-display-enabled": true,
    "room-attempts-font-size": "26px",
    "room-attempts-circle-size": "23px",
    "tracking-disabled-message-enabled": true
}

let intervalHandle = null;

let modState = null;

let currentRoomName = null;
let previousRoomName = null;
let previousRoomRaw = null;
let previousChapterName = null;
let currentChapterRoomObjs = {};
let currentChapterElements = {};
let currentChapterPath = null;
let currentChapterOverallRate = null;
let currentSelectedRoomName = null;
let currentChapterRoomCheckpoints = {};
let currentChapterGoldenShareCheckpointElements = {};

let currentCheckpointObj = null;
let currentCheckpointRoomIndex = null;

let trackingPausedElement = null;

document.addEventListener('DOMContentLoaded', function() {
    //Call updateOverlay once per second
    fetchSettings();
});


function applySettings(){
    // bodyLog("Applying settings...");
    let hideBar = !getSettingValueOrDefault("chapter-bar-enabled");
    if(hideBar){
        document.getElementById("chapter-container").style.display = "none";
    }

    let size = getSettingValueOrDefault("outline-size");
    let outlineColor = getSettingValueOrDefault("outline-color");
    let textShadow = "";
    for(var i = 0; i < 6; i++){
        textShadow += outlineColor+" 0px 0px "+size+", ";
    }
    textShadow = textShadow.substring(0, textShadow.length-2);

    var textColor = getSettingValueOrDefault("color");
    applyToElement("stats-left", textColor, getSettingValueOrDefault("font-size-left"), textShadow);
    applyToElement("stats-center", textColor, getSettingValueOrDefault("font-size-center"), textShadow);
    applyToElement("stats-right", textColor, getSettingValueOrDefault("font-size-right"), textShadow);
    
    applyToElement("chapter-container", textColor, getSettingValueOrDefault("font-size-center"), textShadow);

    document.body.style.fontFamily = getSettingValueOrDefault("font-family");
}

function applySettingsForGoldenShareDisplay(){
    var goldenShareContainer = document.getElementById("golden-share-container");
    var doShow = getSettingValueOrDefault("golden-share-display-enabled");
    if(doShow){
        goldenShareContainer.style.display = "flex";
    } else {
        goldenShareContainer.style.display = "none";
    }

    goldenShareContainer.style.fontSize = getSettingValueOrDefault("golden-share-font-size");
}

function applySettingsForRoomAttemptDisplay(){
    if(getSettingValueOrDefault("room-attempts-display-enabled")){
        document.getElementById("room-attempts-container").style.display = "flex";
    }
}

function applyToElement(id, color, fontSize, textShadow){
    var element = document.getElementById(id);
    element.style.color = color;
    element.style.fontSize = fontSize;
    element.style.textShadow = textShadow;
}


function fetchSettings(){ //Called once per second
    // bodyLog("Fetching settings...");
    var xhr = new XMLHttpRequest();
    xhr.open('GET', './ChapterOverlaySettings.json', true);
    xhr.onreadystatechange = function() {
        //Get content of file
        if (xhr.readyState == 4) {
            if(xhr.status === 404){
                settings = defaultSettings;
            } else if((xhr.status === 200 || xhr.status == 0) && xhr.responseText != "") {
                bodyLog("State == 4, status == 200 || 0 -> "+xhr.responseText, "stats-display");
                settings = JSON.parse(xhr.responseText);
                bodyLog("Settings: "+JSON.stringify(settings), "stats-display");
            } else {
                settings = defaultSettings;
            }
            
            applySettings();
            intervalHandle = setInterval(fetchCurrentChapter, getSettingValueOrDefault("refresh-time-ms"));
        }
    };
    xhr.send();
}

function fetchCurrentChapter(){ //Called once per second
    var xhr = new XMLHttpRequest();
    xhr.open('GET', './stats/modState.txt', true);
    xhr.onreadystatechange = function() {
        //Get content of file
        if (xhr.readyState == 4) {
            if((xhr.status === 200 || xhr.status == 0) && xhr.responseText != "") {
                bodyLog("./stats/modState.txt -> "+xhr.responseText);

                previousRoomName = currentRoomName;

                var newCurrentRoom = parseRoomData(xhr.responseText, true, "stats-display");
                modState = newCurrentRoom.state;

                updateModState();


                if(currentRoomName != null)
                    previousRoomRaw = getCurrentRoom();
                setCurrentRoom(newCurrentRoom, newCurrentRoom.name);

                var roomToDisplayStats = getCurrentRoom();
                var isSelecting = false;
                if(currentSelectedRoomName != null){
                    roomToDisplayStats = currentChapterRoomObjs[currentSelectedRoomName];
                    isSelecting = true;
                }

                var textLeft = getSettingValueOrDefault("text-format-left");
                updateStatsText("stats-left", textLeft, roomToDisplayStats, isSelecting);
                
                var textMiddle = getSettingValueOrDefault("text-format-center");
                updateStatsText("stats-center", textMiddle, roomToDisplayStats, isSelecting);
                
                var textRight = getSettingValueOrDefault("text-format-right");
                updateStatsText("stats-right", textRight, roomToDisplayStats, isSelecting);

                displayRoomAttempts(roomToDisplayStats);


                if((previousRoomName != null && previousChapterName != modState.chapterName) || (previousRoomName == null && currentRoomName != null) || currentChapterPath == null){
                    //Update the chapter layout
                    previousChapterName = modState.chapterName;
                    updateChapterLayout(modState.chapterName);
                    
                } else if(previousRoomName != null && !areRoomsEqual(previousRoomRaw, getCurrentRoom())){
                    //Update only one room
                    updateRoomInLayout(getPreviousRoom(), getCurrentRoom());
                }
            }
        }
    };
    xhr.send();
}

function updateModState(){
    if(trackingPausedElement != null){
        if(modState.isTrackingPaused && getSettingValueOrDefault("tracking-disabled-message-enabled")){
            trackingPausedElement.style.display = "block";
        } else {
            trackingPausedElement.style.display = "none";
        }
    }
}

function updateStatsText(targetId, text, room, isSelecting){
    text = text.replace("{room:name}", room.name);
    text = text.replace("{chapter:SID}", modState.chapterName);
    text = text.replace("{state:trackingPaused}", modState.isTrackingPaused == true ? "Yes" : "No");
    text = text.replace("{state:recordingPath}", modState.isRecordingEnabled == true ? "Yes" : "No");

    var selectedRate = getSettingValueOrDefault("attempts");
    if(selectedRate == "5"){
        text = text.replace("{room:rate}", (room.rate5*100).toFixed(2));
        text = text.replace("{room:successes}", room.successes5);
        text = text.replace("{room:attempts}", room.totalAttempts5);
        text = text.replace("{room:failures}", room.failures5);
    } else if(selectedRate == "10"){
        text = text.replace("{room:rate}", (room.rate10*100).toFixed(2));
        text = text.replace("{room:successes}", room.successes10);
        text = text.replace("{room:attempts}", room.totalAttempts10);
        text = text.replace("{room:failures}", room.failures10);
    } else if(selectedRate == "20"){    
        text = text.replace("{room:rate}", (room.rate20*100).toFixed(2));
        text = text.replace("{room:successes}", room.successes20);
        text = text.replace("{room:attempts}", room.totalAttempts20);
        text = text.replace("{room:failures}", room.failures20);
    } else {
        text = text.replace("{room:rate}", (room.rateMax*100).toFixed(2));
        text = text.replace("{room:successes}", room.successesMax);
        text = text.replace("{room:attempts}", room.totalAttemptsMax);
        text = text.replace("{room:failures}", room.failuresMax);
    }

    text = text.replace("{room:goldenDeaths}", room.goldenBerryDeaths);
    text = text.replace("{room:goldenDeathsSession}", room.goldenBerryDeathsSession);
    
    var roomCP = currentChapterRoomCheckpoints[room.name];
    if(roomCP === undefined){
        text = text.replace("{checkpoint:name}", "-");
        text = text.replace("{checkpoint:abbreviation}", "-");
        text = text.replace("{checkpoint:roomNumber}",  "-");
    } else {
        text = text.replace("{checkpoint:name}", roomCP.checkpoint.name);
        text = text.replace("{checkpoint:abbreviation}", roomCP.checkpoint.abbreviation);
        text = text.replace("{checkpoint:roomNumber}",  roomCP.roomIndex+1);
    }

    if(roomCP !== undefined){
        var countAttemptsChapter = 0;
        var countSuccessesChapter = 0;
        var countRoomsChapter = 0;

        var countAttemptsCheckpoint = 0;
        var countSuccessesCheckpoint = 0;
        var countRoomsCheckpoint = 0;

        var gbDeathsChapter = 0;
        var gbDeathsCheckpoint = 0;
        var gbDeathsChapterSession = 0;
        var gbDeathsCheckpointSession = 0;

        var chapterGoldenChance = 1;
        var checkpointGoldenChance = 1;
        var fromNowGoldenChance = calculateRemainingGoldenChance(room);
        var toNowGoldenChance = calculateRemainingGoldenChance(room, true);

        var deathsBeforeRoom = 0;
        var deathsBeforeRoomSession = 0;
        var deathsBeforeCheckpoint = 0;
        var deathsBeforeCheckpointSession = 0;
        var foundRoom = false;
        var foundCheckpoint = false;

        var rateNumber = getSelectedRateNumber();

        //Iterate the object currentChapterRoomObjs
        for(var checkpointIndex = 0; checkpointIndex < currentChapterPath.length; checkpointIndex++){
            var roomsObj = currentChapterPath[checkpointIndex].rooms;
            for(var roomIndex = 0; roomIndex < roomsObj.length; roomIndex++){
                var roomName = roomsObj[roomIndex];
                var roomObj = currentChapterRoomObjs[roomName];

        // for(var key in currentChapterRoomObjs){
        //     if(currentChapterRoomObjs.hasOwnProperty(key)){
        //         var roomObj = currentChapterRoomObjs[key];
                

                //Choke Rate
                if(!foundRoom && roomObj.name == room.name){
                    foundRoom = true;
                    deathsBeforeRoom = gbDeathsChapter;
                    deathsBeforeRoomSession = gbDeathsChapterSession;
                }
                if(!foundCheckpoint && roomsInSameCheckpoint(roomObj, room)){
                    foundCheckpoint = true;
                    deathsBeforeCheckpoint = gbDeathsChapter;
                    deathsBeforeCheckpointSession = gbDeathsChapterSession;
                }



                //Golden Berry Deaths
                gbDeathsChapter += roomObj.goldenBerryDeaths;
                gbDeathsChapterSession += roomObj.goldenBerryDeathsSession;
                if(roomsInSameCheckpoint(room, roomObj)){
                    gbDeathsCheckpoint += roomObj.goldenBerryDeaths;
                    gbDeathsCheckpointSession += roomObj.goldenBerryDeathsSession;
                }



                //Calculate Golden Chances
                chapterGoldenChance *= getSelectedRateOfRoom(roomObj);
                if(roomsInSameCheckpoint(room, roomObj)){
                    checkpointGoldenChance *= getSelectedRateOfRoom(roomObj);
                }

                //Count rooms
                if(roomObj.attempts.length >= 1){
                    countRoomsChapter++;
                    if(roomsInSameCheckpoint(room, roomObj)){
                        countRoomsCheckpoint++;
                    }
                }

                //Count attempts and successes
                var max = Math.min(rateNumber, roomObj.attempts.length);
                for(var i = 0; i < max; i++){
                    countAttemptsChapter++;
                    if(roomsInSameCheckpoint(room, roomObj)){
                        countAttemptsCheckpoint++;
                    }

                    if(roomObj.attempts[i]){
                        countSuccessesChapter++;
                        if(roomsInSameCheckpoint(room, roomObj)){
                            countSuccessesCheckpoint++;
                        }
                    }
                }
            }
        }

        var chapterSuccessRate = countAttemptsChapter == 0 ? 0 : countSuccessesChapter/countAttemptsChapter;
        var checkpointSuccessRate = countAttemptsCheckpoint == 0 ? 0 : countSuccessesCheckpoint/countAttemptsCheckpoint;

        var chapterGoldenEstimateAttempts = 1 / chapterGoldenChance;
        var checkpointGoldenEstimateAttempts = 1 / checkpointGoldenChance;

        var goldenChanceDecimals = getSettingValueOrDefault("golden-chance-decimals");

        var roomChokeRate = room.goldenBerryDeaths / (gbDeathsChapter - deathsBeforeRoom);
        var roomChokeRateSession = room.goldenBerryDeathsSession / (gbDeathsChapterSession - deathsBeforeRoomSession);

        var checkpointChokeRate = gbDeathsCheckpoint / (gbDeathsChapter - deathsBeforeCheckpoint);
        var checkpointChokeRateSession = gbDeathsCheckpointSession / (gbDeathsChapterSession - deathsBeforeCheckpointSession);

        text = text.replace("{chapter:rate}", (chapterSuccessRate*100).toFixed(2));
        text = text.replace("{chapter:DPR}", ((1/chapterSuccessRate)-1).toFixed(2));
        text = text.replace("{chapter:countRooms}", countRoomsChapter);
        text = text.replace("{chapter:goldenDeaths}", gbDeathsChapter);
        text = text.replace("{chapter:goldenDeathsSession}", gbDeathsChapterSession);
        text = text.replace("{chapter:goldenChance}", (chapterGoldenChance*100).toFixed(goldenChanceDecimals));
        text = text.replace("{chapter:goldenEstimateAttempts}", chapterGoldenEstimateAttempts.toFixed(0));

        text = text.replace("{checkpoint:rate}", (checkpointSuccessRate*100).toFixed(2));
        text = text.replace("{checkpoint:DPR}", ((1/checkpointSuccessRate)-1).toFixed(2));
        text = text.replace("{checkpoint:countRooms}", countRoomsCheckpoint);
        text = text.replace("{checkpoint:goldenDeaths}", gbDeathsCheckpoint);
        text = text.replace("{checkpoint:goldenDeathsSession}", gbDeathsCheckpointSession);
        text = text.replace("{checkpoint:goldenChance}", (checkpointGoldenChance*100).toFixed(goldenChanceDecimals));
        text = text.replace("{checkpoint:goldenEstimateAttempts}", checkpointGoldenEstimateAttempts.toFixed(0));
        text = text.replace("{checkpoint:goldenChokeRate}", (checkpointChokeRate*100).toFixed(2));
        text = text.replace("{checkpoint:goldenChokeRateSession}", (checkpointChokeRateSession*100).toFixed(2));

        text = text.replace("{room:goldenChokeRate}", (roomChokeRate*100).toFixed(2));
        text = text.replace("{room:goldenChokeRateSession}", (roomChokeRateSession*100).toFixed(2));

        text = text.replace("{run:roomToEndGoldenChance}", (fromNowGoldenChance*100).toFixed(goldenChanceDecimals));
        text = text.replace("{run:startToRoomGoldenChance}", (toNowGoldenChance*100).toFixed(goldenChanceDecimals));

    } else {
        var loadingReplacement = "...";
        text = text.replace("{chapter:rate}", loadingReplacement);
        text = text.replace("{chapter:DPR}", loadingReplacement);
        text = text.replace("{chapter:countRooms}", loadingReplacement);
        text = text.replace("{chapter:goldenDeaths}", loadingReplacement);
        text = text.replace("{chapter:goldenDeathsSession}", loadingReplacement);
        text = text.replace("{chapter:goldenChance}", loadingReplacement);
        text = text.replace("{chapter:goldenEstimateAttempts}", loadingReplacement);

        text = text.replace("{checkpoint:rate}", loadingReplacement);
        text = text.replace("{checkpoint:DPR}", loadingReplacement);
        text = text.replace("{checkpoint:countRooms}", loadingReplacement);
        text = text.replace("{checkpoint:goldenDeaths}", loadingReplacement);
        text = text.replace("{checkpoint:goldenChance}", loadingReplacement);
        text = text.replace("{checkpoint:goldenEstimateAttempts}", loadingReplacement);
        text = text.replace("{checkpoint:goldenChokeRate}", loadingReplacement);
        text = text.replace("{checkpoint:goldenChokeRateSession}", loadingReplacement);
        
        text = text.replace("{room:goldenChokeRate}", loadingReplacement);
        text = text.replace("{room:goldenChokeRateSession}", loadingReplacement);

        text = text.replace("{run:roomToEndGoldenChance}", loadingReplacement);
        text = text.replace("{run:startToRoomGoldenChance}", loadingReplacement);
    }

    text = text.replace("{test}", room.test);
    text = text.replace("NaN", getSettingValueOrDefault("text-nan-replacement"));
    document.getElementById(targetId).innerHTML = text;
}


var roomAttemptsInitialized = false;
function displayRoomAttempts(roomToDisplayStats){
    if(!roomAttemptsInitialized){
        roomAttemptsInitialized = true;
        applySettingsForRoomAttemptDisplay();
    }

    var fontSize = getSettingValueOrDefault("room-attempts-font-size");
    var circleSize = getSettingValueOrDefault("room-attempts-circle-size");

    var amountAttempts = getSelectedRateNumber();

    var container = document.getElementById("room-attempts-container");
    container.innerHTML = "";

    //Start element
    var startElement = document.createElement("div");
    startElement.className = "room-attempts-start-end";
    startElement.innerHTML = "New ➔";
    startElement.style.fontSize = fontSize;
    container.appendChild(startElement);

    //Iterate the attempts in roomToDisplayStats
    for(var i = 0; i < roomToDisplayStats.attempts.length; i++){
        var attempt = roomToDisplayStats.attempts[i];

        if(i >= amountAttempts){
            break;
        }

        /* Create the element:
        <div class="room-attempts-element">
			<div class="room-attempts-circle">
				<div class="room-attempts-circle-inner green"></div>
			</div>
		</div>
        */
        var attemptElement = document.createElement("div");
        attemptElement.className = "room-attempts-element";

        var circleElement = document.createElement("div");
        circleElement.className = "room-attempts-circle";
        circleElement.style.width = circleSize;
        circleElement.style.height = circleSize;

        var circleInnerElement = document.createElement("div");
        circleInnerElement.className = "room-attempts-circle-inner";
        circleInnerElement.style.width = circleSize;
        circleInnerElement.style.height = circleSize;

        if(attempt){
            circleInnerElement.classList.add("green");
        } else {
            circleInnerElement.classList.add("red");
        }

        circleElement.appendChild(circleInnerElement);
        attemptElement.appendChild(circleElement);

        container.appendChild(attemptElement);
    }

    //End element
    var endElement = document.createElement("div");
    endElement.className = "room-attempts-start-end";
    endElement.innerHTML = "➔ Old";
    endElement.style.fontSize = fontSize;
    container.appendChild(endElement);
}


function updateChapterLayout(chapterName){ //Called once per second
    var xhr = new XMLHttpRequest();
    xhr.open('GET', './stats/'+chapterName+'.txt', true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            if(xhr.status === 200 || xhr.status == 0)
            {
                var roomStrings = xhr.responseText.split("\n");
                currentChapterRoomObjs = {};
                currentChapterElements = {};
                for(var i = 1; i < roomStrings.length; i++){ //Start at 1 because the current room is always row 0
                    if(roomStrings[i].trim() == "") continue;
                    var room = parseRoomData(roomStrings[i], false);
                    currentChapterRoomObjs[room.name] = room;
                }
                var currentRoom = parseRoomData(roomStrings[0], false);
                setCurrentRoom(currentRoom, currentRoom.name);

                getChapterPath(chapterName, currentChapterRoomObjs);
            }
        }
    };
    xhr.send();
}

function getChapterPath(chapterName, roomObjects){ //Called once per second
    var xhr = new XMLHttpRequest();
    xhr.open('GET', './paths/'+chapterName+'.txt', true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            if(xhr.status === 200 || xhr.status == 0)
            {
                if(xhr.responseText == ""){ //File was not found or was empty
                    currentChapterPath = null;
                    currentCheckpointObj = null;
                    currentCheckpointRoomIndex = null;
                    
                    document.getElementById("chapter-container").innerHTML = "Path info not found";
                } else {
                    currentChapterPath = parseChapterPath(xhr.responseText);
                    displayRoomObjects(roomObjects);
                }
            }
        }
    };
    xhr.send();
}


//Creates HTML elements for all room objects and saves them in currentChapterElements
function displayRoomObjects(roomObjs){
    var container = document.getElementById("chapter-container");
    container.innerHTML = "";

    //Add the tracking paused element
    trackingPausedElement = document.createElement("div");
    trackingPausedElement.id = "tracking-paused";
    trackingPausedElement.innerText = "Tracking is paused";
    trackingPausedElement.style.display = "none";
    container.appendChild(trackingPausedElement);

    //Add the start element
    var startElement = document.createElement("div");
    startElement.className = "start-end-element";
    container.appendChild(startElement);


    for(var checkpointIndex = 0; checkpointIndex < currentChapterPath.length; checkpointIndex++){
        if(checkpointIndex != 0){ //Skip checkpoint element for first and last
            var checkpointElement = document.createElement("div");
            checkpointElement.classList.add("checkpoint-element");
            container.appendChild(checkpointElement);
        }
        
        var roomsObj = currentChapterPath[checkpointIndex].rooms;

        for(var roomIndex = 0; roomIndex < roomsObj.length; roomIndex++){
            var roomName = currentChapterPath[checkpointIndex].rooms[roomIndex];
            var room = getRoomByNameOrDefault(roomObjs, roomName);

            currentChapterRoomCheckpoints[roomName] = {
                checkpoint: currentChapterPath[checkpointIndex],
                roomIndex: roomIndex,
            };

            var roomElement = document.createElement("div");
            roomElement.classList.add("room-element");

            var classColor = getColorClass(room);
            roomElement.classList.add(classColor);

            if(room.name == getCurrentRoom().name){
                roomElement.classList.add("selected");
                currentCheckpointObj = currentChapterPath[checkpointIndex];
                currentCheckpointRoomIndex = roomIndex;
            }
            
            roomElement.setAttribute("data-room-name", room.name);
            //On hover, set a global variable to this room name
            roomElement.onmouseover = function(){
                var roomName = this.getAttribute("data-room-name");
                currentSelectedRoomName = roomName;
            }
            roomElement.onmouseleave = function(){
                currentSelectedRoomName = null;
            }

            container.appendChild(roomElement);
            currentChapterElements[roomName] = roomElement;

            if(roomIndex != roomsObj.length - 1){ //Skip border element for last room
                var borderElement = document.createElement("div");
                borderElement.classList.add("border-element");
                container.appendChild(borderElement);
            }
        }
    }

    //Add the end element
    var endElement = document.createElement("div");
    endElement.className = "start-end-element";
    container.appendChild(endElement);

    displayGoldenShares();
}


function displayGoldenShares(){
    currentChapterGoldenShareCheckpointElements = {};

    var container = document.getElementById("golden-share-container");
    container.innerHTML = "";

    //Add the start element
    var startElement = document.createElement("div");
    startElement.className = "golden-share-start-end";
    container.appendChild(startElement);

    for(var checkpointIndex = 0; checkpointIndex < currentChapterPath.length; checkpointIndex++){
        if(checkpointIndex != 0){ //Skip checkpoint element for first and last
            var checkpointElement = document.createElement("div");
            checkpointElement.classList.add("golden-share-checkpoint-delim");
            container.appendChild(checkpointElement);
        }
        
        var checkpointObj = currentChapterPath[checkpointIndex];

        var checkpointElement = document.createElement("div");
        checkpointElement.classList.add("golden-share-checkpoint");
        checkpointElement.style.flexGrow = checkpointObj.rooms.length * 50 + (checkpointObj.rooms.length-1) * 3;
        container.appendChild(checkpointElement);

        var checkpointName = checkpointObj.name;
        currentChapterGoldenShareCheckpointElements[checkpointName] = checkpointElement;
    }

    
    //Add the end element
    var endElement = document.createElement("div");
    endElement.className = "golden-share-start-end";
    container.appendChild(endElement);
    
    updateGoldenShares(currentChapterRoomObjs);
    applySettingsForGoldenShareDisplay();
}



function updateRoomInLayout(previousRoom, currentRoom){
    console.log("Updating room in layout: "+previousRoom.name+" -> "+currentRoom.name);

    var currentRoomElem = currentChapterElements[currentRoom.name];
    console.log("Current room elem: "+JSON.stringify(currentRoomElem));

    if(previousRoom != null){
        var previousRoomElem = currentChapterElements[previousRoom.name];
        if(previousRoomElem === undefined || previousRoom.name == currentRoom.name){ //Died in room
            
        } else {
            previousRoomElem.classList.remove("selected");
        }
        updateChapterStats(modState.chapterName);
    }
    
    if(currentRoomElem !== undefined){
        currentRoomElem.classList.add("selected");
    }
}

//Fetches the current chapter stats and calls an update with the room objects
function updateChapterStats(chapterName){
    bodyLog('Updating chapter stats');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', './stats/'+chapterName+'.txt', true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            if(xhr.status === 200 || xhr.status == 0)
            {
                bodyLog('./stats/'+chapterName+'.txt -> '+xhr.responseText);
                
                var roomStrings = xhr.responseText.split("\n");
                currentChapterRoomObjs = {};

                for(var i = 1; i < roomStrings.length; i++){ //Start at 1 because the current room is always row 0
                    if(roomStrings[i].trim() == "") continue;
                    var room = parseRoomData(roomStrings[i], false);
                    currentChapterRoomObjs[room.name] = room;
                }

                updateRoomObjects(currentChapterRoomObjs);
            }
        }
    };
    xhr.send();
}

//Updates the already existing HTML elements with new data
function updateRoomObjects(roomObjs){
    for(var checkpointIndex = 0; checkpointIndex < currentChapterPath.length; checkpointIndex++){
        var roomsObj = currentChapterPath[checkpointIndex].rooms;
        for(var roomIndex = 0; roomIndex < roomsObj.length; roomIndex++){
            var roomName = roomsObj[roomIndex];
            var room = getRoomByNameOrDefault(roomObjs, roomName);
            var roomElement = currentChapterElements[roomName];
            var classColor = getColorClass(room);
            roomElement.classList.remove("light-green");
            roomElement.classList.remove("green");
            roomElement.classList.remove("yellow");
            roomElement.classList.remove("red");
            roomElement.classList.remove("gray");
            roomElement.classList.add(classColor);

            if(room.name == getCurrentRoom().name){
                currentCheckpointObj = currentChapterPath[checkpointIndex];
                currentCheckpointRoomIndex = roomIndex;
            }
        }
    }

    updateGoldenShares(currentChapterRoomObjs);
}



//Updates the already existing HTML elements with new data
function updateGoldenShares(roomObjs){
    var totalGoldenDeaths = 0;
    var totalGoldenDeathsSession = 0;
    var checkpointDeathsObj = {};
    var checkpointDeathsSessionObj = {};
    
    for(var checkpointIndex = 0; checkpointIndex < currentChapterPath.length; checkpointIndex++){
        var checkpointObj = currentChapterPath[checkpointIndex];
        var roomsObj = checkpointObj.rooms;

        checkpointDeathsObj[checkpointObj.name] = 0;
        checkpointDeathsSessionObj[checkpointObj.name] = 0;

        for(var roomIndex = 0; roomIndex < roomsObj.length; roomIndex++){
            var roomName = roomsObj[roomIndex];
            var room = getRoomByNameOrDefault(roomObjs, roomName);
            totalGoldenDeaths += room.goldenBerryDeaths;
            totalGoldenDeathsSession += room.goldenBerryDeathsSession;
            checkpointDeathsObj[checkpointObj.name] += room.goldenBerryDeaths;
            checkpointDeathsSessionObj[checkpointObj.name] += room.goldenBerryDeathsSession;
        }
    }


    for(var checkpointIndex = 0; checkpointIndex < currentChapterPath.length; checkpointIndex++){
        var checkpointObj = currentChapterPath[checkpointIndex];
        var goldenShareElement = currentChapterGoldenShareCheckpointElements[checkpointObj.name];

        var roomsObj = checkpointObj.rooms;
        var checkpointDeaths = checkpointDeathsObj[checkpointObj.name];
        var checkpointDeathsSession = checkpointDeathsSessionObj[checkpointObj.name];

        var goldenDisplay = 0;
        var addition = "";

        if(getSettingValueOrDefault("golden-share-style-percent")){
            if(totalGoldenDeaths == 0){
                goldenDisplay = 0;
            } else {
                goldenDisplay = ((checkpointDeaths / totalGoldenDeaths) * 100).toFixed(0);
            }
            addition = "%";
        } else {
            goldenDisplay = checkpointDeaths+"";
        }

        var goldenDisplaySession = 0;
        var additionSession = "";
        if(getSettingValueOrDefault("golden-share-style-percent")){
            if(totalGoldenDeathsSession == 0){
                goldenDisplaySession = 0;
            } else {
                goldenDisplaySession = ((checkpointDeathsSession / totalGoldenDeathsSession) * 100).toFixed(0);
            }
            additionSession = "%";
        } else {
            goldenDisplaySession = checkpointDeathsSession+"";
        }

        var combined = "";
        if(getSettingValueOrDefault("golden-share-show-current-session")){
            combined = goldenDisplay+addition+" ("+goldenDisplaySession+additionSession+")";
        } else {
            combined = goldenDisplay+addition;
        }

        goldenShareElement.innerHTML = combined;
    }
}



function getCurrentRoom(){
    return currentChapterRoomObjs[currentRoomName];
}
function setCurrentRoom(room, roomName){
    currentRoomName = roomName;
    return currentChapterRoomObjs[roomName] = room;
}
function getPreviousRoom(){
    return currentChapterRoomObjs[previousRoomName];
}
function getRoomByNameOrDefault(roomObjs, roomDebugName){
    //If roomObjs has a key with the same name as roomDebugName, return that room
    if(roomObjs[roomDebugName]){
        return roomObjs[roomDebugName];
    }

    return {
        attempts: [],
        goldenBerryDeaths: 0,
        rate5: NaN,
        rate10: NaN,
        rate20: NaN,
        rateMax: NaN,
    };
}

function getColorClass(room){
    var compareAgainstRate = getSelectedRateOfRoom(room);
    
    var lightGreenCutoff = getSettingValueOrDefault("light-green-cutoff");
    var greenCutoff = getSettingValueOrDefault("green-cutoff");
    var yellowCutoff = getSettingValueOrDefault("yellow-cutoff");

    if(isNaN(compareAgainstRate)){
        return "gray";
    } else if(compareAgainstRate >= lightGreenCutoff){
        return "light-green";
    } else if(compareAgainstRate >= greenCutoff){
        return "green";
    } else if(compareAgainstRate >= yellowCutoff){
        return "yellow";
    } else {
        return "red";
    }
}

function getSelectedRateOfRoom(room){
    var selectedRate = getSettingValueOrDefault("attempts");
    if(selectedRate == "5"){
        return room.rate5;
    } else if(selectedRate == "10"){
        return room.rate10;
    } else if(selectedRate == "20"){
        return room.rate20;
    } else {
        return room.rateMax;
    }
}
function getSelectedRateNumber(){
    var selectedRate = getSettingValueOrDefault("attempts");
    if(selectedRate == "5"){
        return 5;
    } else if(selectedRate == "10"){
        return 10;
    } else if(selectedRate == "20"){
        return 20;
    } else {
        return 9999999;
    }
}

function roomsInSameCheckpoint(room, otherRoom){
    var roomCP = currentChapterRoomCheckpoints[room.name];
    var otherRoomCP = currentChapterRoomCheckpoints[otherRoom.name];

    if(otherRoomCP === undefined) return false;

    if(roomCP.checkpoint === undefined || otherRoomCP.checkpoint === undefined){
        return false;
    }

    return roomCP.checkpoint.name == otherRoomCP.checkpoint.name;
}

function calculateRemainingGoldenChance(roomToCalc, toNow=false){
    var remainingGoldenChance = 1;
    var skipMode = !toNow;

    for(var checkpointIndex = 0; checkpointIndex < currentChapterPath.length; checkpointIndex++){
        var roomsObj = currentChapterPath[checkpointIndex].rooms;
        for(var roomIndex = 0; roomIndex < roomsObj.length; roomIndex++){
            var roomName = roomsObj[roomIndex];
            var room = getRoomByNameOrDefault(currentChapterRoomObjs, roomName);

            if(room.name == roomToCalc.name){ //Found current room, disable skip mode and start calculating from here
                skipMode = !skipMode;
            }

            if(!skipMode){
                var roomRate = getSelectedRateOfRoom(room);
                if(!isNaN(roomRate)){
                    remainingGoldenChance *= getSelectedRateOfRoom(room);
                } else {
                    remainingGoldenChance = 0; //If there is a room that was not yet played, chances are 0%
                }
            }

            if(remainingGoldenChance == 0) break; //No need to keep calculating if chances are 0%
        }
    }

    return remainingGoldenChance;
}