let QueuePort;
let Queue = [] //Array of dicts that are waiting in queue by order (1st object in queue is being processed)
let QueueCompleted = [] //Array of downloaded videos to retrieve on popup shown
let QueuedIds = {}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        if (tab.url.includes("https://www.youtube.com/watch")) {
            console.log("TAB OPEN");
            chrome.tabs.sendMessage(tabId, {});
        }
    }
});

chrome.runtime.onConnect.addListener(function(Port) {
    console.log("popup.js has started a connection . . .")

    QueuePort = Port;
    UpdatePopupQueue();
    Port.onDisconnect.addListener(function() { console.log("popup.js has disconnected . . ."); QueuePort = null; })
})

function ClearPopupQueue() {
    if (QueuePort != null) { QueuePort.postMessage({"Clear": true}); }
}

function UpdatePopupQueue() {
    if (QueuePort != null) {
        let InvertedQueue = (Queue.slice()).reverse();
        QueuePort.postMessage(InvertedQueue.concat(QueueCompleted));
    }
}

class Downloader {
    constructor() {
        this._port = null;

        this._ContentListeners = [] //Array of all content listeners from onMessage()
        this._Callbacks = {}; //Dictionary of content listeners pointing to all functions that need to be executed
    }

    _processMessage(msg) {
        for (let i = 0; i < this._ContentListeners.length; i++) {
            let Content = this._ContentListeners[i]

            if (msg[Content] != null) {
                let Callbacks = this._Callbacks[Content]

                if (Callbacks != null) {
                    for (let j = 0; j < Callbacks.length; j++) {
                        let Response = Callbacks[j](msg[Content])
                        if (Response == null || !Response) {
                            Callbacks.splice(j, 1)
                            if (Callbacks.length == 0) { this._ContentListeners.splice(i, 1); delete this._Callbacks[Content]; }
                        }
                    }
                }
            }
        }
    }

    _connect() {
        console.log("NEW PORT CREATED")
        this._port = chrome.runtime.connectNative('com.youtube.dl');

        let This = this;

        this._port.onMessage.addListener(function(msg) { //Handle all messages received from downloader.py
            let Progress = msg["Progress"];
            let Completed = msg["Completed"];
            let Error = msg["Critical Error"];

            if (Progress) {

                if ((Progress["status"] == "started" || Progress["status"] == "downloading") && Queue[0]["Started"] == null) {
                    Queue[0]["Started"] = true;
                    console.log(Queue[0]["id"] + " has started downloading");
                }
                Queue[0]["Progress"] = Progress

            } else if (Completed) {

                if (Completed == Queue[0]["id"]) {
                    console.log(Completed + " has finished");
                } else {console.log(Completed + " is not equal to 1st in queue " + Queue[0]["id"])}
                Queue[0]["Completed"] = true

            } else if (Error) {

                console.log(Queue[0]["id"] + " failed to download (critical error occured)");
                Queue[0]["Completed"] = 1

            } else {
                for (var v in msg) {
                    if (typeof msg[v] == "string") { msg[v] = msg[v].replace(/\n/g, ''); } //Remove new lines
                }
            }

            if (Queue[0] != null) {
                if (QueuePort != null) { QueuePort.postMessage([Queue[0]]); } //Update progress if popup is open
                if (Queue[0]["Completed"] != null) { //Remove video from queue if completed
                    QueueCompleted.unshift(Queue[0]);
                    Queue.shift();
                    if (Queue.length != 0) { This.postMessage(Queue[0]); } //Continue to next in queue
                }
            }
            console.log(msg)
            This._processMessage(msg)
        });
        this._port.onDisconnect.addListener(function() { console.log("PORT DISCONNECTED"); this._port = null; });
    }

    postMessage(Message) {
        if (this._port == null) { this._connect(); }
        this._port.postMessage(Message)
    }

    onMessage(Content, Callback) { //If callback doesn't return true the function gets removed from onMessage after execution
        if (this._Callbacks[Content] == null) {
            this._ContentListeners.push(Content);
            this._Callbacks[Content] = [];
        }
        this._Callbacks[Content].push(Callback);
    }
}

var DownloaderPort = new Downloader();
let OutDirectory = null;

chrome.runtime.onMessage.addListener((Request, Sender, SendResponse) => {
    if (Request["GetDir"]) { //Retrieve Output Directory from py script
        if (OutDirectory == null) {
            DownloaderPort.onMessage("GetDir", function(Response) { OutDirectory = Response; SendResponse(Response); })
            DownloaderPort.postMessage({"GetDir": true})
            return true;
        } else { SendResponse(OutDirectory); }
    } else if (Request["Delete"]) { //Delete video from queue
        let DeletedVideo = null;
        console.log(Request["Delete"])
        if (Queue[0] != null && Queue[0]["uid"] == Request["Delete"]) { //Check if video marked for deletion is being processed
            DeletedVideo = Queue[0]
            QueuedIds[DeletedVideo["id"]] -= 1
            Queue.shift();
            DownloaderPort.postMessage({"Cancel": true})
        } else {
            for (let i = 1; i < Queue.length; i++) { //Check if video marked for deletion is in queue
                if (Queue[i]["uid"] == Request["Delete"]) {
                    DeletedVideo = Queue[i]
                    Queue.splice(i, 1);
                    QueuedIds[DeletedVideo["id"]] -= 1
                    break;
                }
            }
            if (DeletedVideo == null) {
                for (let i = 0; i < QueueCompleted.length; i++) { //Check if video marked for deletion is completed
                    if (QueueCompleted[i]["uid"] == Request["Delete"]) {
                        DeletedVideo = QueueCompleted[i];
                        QueueCompleted.splice(i, 1);
                        break;
                    }
                } 
            }
        }
        if (DeletedVideo != null && QueuePort != null) { QueuePort.postMessage({"Delete": [DeletedVideo]}); }
    } else if (Request["Clear"] != null) { //Remove completed videos from queue
        if (QueuePort != null) { QueuePort.postMessage({"Delete": QueueCompleted}); }
        QueueCompleted = []
    } else {
        if (QueuedIds[Request["id"]] == null) { //Create uid and new title for duplicate videos in queue
            QueuedIds[Request["id"]] = 0;
        } else {
            QueuedIds[Request["id"]] += 1;
            Request["title"] = "[" + QueuedIds[Request["id"]] + "] " + Request["title"]
        }
        Request["uid"] = Request["id"] + QueuedIds[Request["id"]]
        console.log("NEW UID: " + Request["uid"])

        Queue.push(Request)
        if (Queue.length == 1) { DownloaderPort.postMessage(Queue[0]); }

        console.log(Queue)
        console.log(QueuedIds)
    }
});