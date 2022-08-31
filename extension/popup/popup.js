var DLQueue = document.querySelector(".DL-Queue");
var EmptyQueue = DLQueue.querySelector(".Empty-Queue");
var QueuedVideo = chrome.runtime.getURL("popup/Queued-Video.html");
var VideoQueue = {}; //Dict of video ids that are already present in queue

let Emoticons = [
    "\u1559\u0028\u21c0\u2038\u21bc\u2036\u0029\u1557", //ᕙ(⇀‸↼‶)ᕗ
    "\uff61\u309c\u0028\uff40\u0414\u00b4\u0029\u309c\uff61", //｡゜(｀Д´)゜｡
    "\u0028\u273f\u00b4\u203f\u0060\u0029", //(✿´‿`)
    "\uff08\u00b4\u30fb\u03c9\u30fb\u0020\u0060\uff09", //（´・ω・ `）
    "\u0027\u0028\u15d2\u15e3\u15d5\u0029\u055e", //'(ᗒᗣᗕ)՞
    "\u00af" + "\\_" + "\u0028\u30c4\u0029\u005f\u002f\u00af" //¯\_(ツ)_/¯
]

function ShowEmpty() {
    EmptyQueue.innerHTML = "The video queue is empty!<br>" + Emoticons[Math.floor(Math.random()*Emoticons.length)];
    EmptyQueue.style.display = "block";
}
ShowEmpty();

let ThemeDark = true;
chrome.storage.sync.get(["ThemeDark"], function(Result) {
    if (Result.ThemeDark !== null) { ThemeDark = !Result.ThemeDark; SwitchTheme() }
});

let ThemeSwitcher = document.querySelector(".Theme");
ThemeSwitcher.addEventListener("click", SwitchTheme)

function SwitchTheme() {
    let Icon = ThemeSwitcher.querySelector("span")
    
    if (ThemeDark == true) {
        Icon.innerText = "dark_mode"
        document.body.removeAttribute("dark")
        ThemeDark = false;
    } else {
        Icon.innerText = "light_mode";
        document.body.setAttribute("dark", "")
        ThemeDark = true
    }
    chrome.storage.sync.set({"ThemeDark": ThemeDark});
}

document.querySelector(".Clear-All").addEventListener("click", () => { chrome.runtime.sendMessage({"Clear": true}); })

function ToTimestamp(Seconds) {
    let Minutes = Math.floor(Seconds/60);
    if (Minutes < 10) { Minutes = "0" + Minutes}

    Seconds = Math.floor(Seconds - Minutes*60);
    if (Seconds < 10) { Seconds = "0" + Seconds};

    return Minutes + ":" + Seconds;
}
 
async function UpdateQueue() {
    var response = await fetch(QueuedVideo);
    switch (response.status) {
        case 200:
            VideoHTML = await response.text();

            VideoPlaceholder = document.createElement("div");
            VideoPlaceholder.innerHTML = VideoHTML;
            let VideoElement = VideoPlaceholder.firstElementChild;

            var Port = chrome.runtime.connect({});

            Port.onMessage.addListener(function(msg) {
                if (msg["Clear"] != null) {
                    VideoQueue = {};
                    let Elements = DLQueue.querySelectorAll(".Queued-Video");
                    for (let i = 0; i < Elements.length; i++) { DLQueue.removeChild(Elements[i]); }
                } else if (msg["Delete"] != null) {
                    for (let i = 0; i < msg["Delete"].length; i++) {
                        let DeletedVideo = VideoQueue[msg["Delete"][i]["uid"]];
                        if (DeletedVideo != null) {
                            DLQueue.removeChild(DeletedVideo);
                        } 
                    }
                } else {
                    for (let i = 0; i < msg.length; i++) {
                        let Info = msg[i];
    
                        let NewVideo;
                        if (VideoQueue[Info["uid"]] != null) {
                            NewVideo = VideoQueue[Info["uid"]] //Only update values if video is already present in queue
                        } else {
                            NewVideo = VideoElement.cloneNode(true);
                            NewVideo.style.setProperty("--background-url", "url(" + Info["thumbnail"] + ")");
    
                            let Title = NewVideo.querySelector(".Title");
                            Title.text = Info["title"];
                            Title.addEventListener("click", () => { chrome.tabs.create({active: true, url: Info["Url"]}); });
    
                            let Delete = NewVideo.querySelector(".Delete")
                            Delete.addEventListener("click", () => { chrome.runtime.sendMessage({"Delete": Info["uid"]}); })
    
                            VideoQueue[Info["uid"]] = NewVideo;
                            DLQueue.append(NewVideo);
                        }
    
                        let Status = NewVideo.querySelector(".Status");
                        let Percent = NewVideo.querySelector(".Percent");
                        let ProgressCircle = NewVideo.querySelector(".Video-Progress .Inner .Outline");
    
                        let InfoContainer = NewVideo.querySelector(".Video-Info");
    
                        if (Info["Started"] == null) {
    
                            Percent.innerText = "0%";
                            ProgressCircle.style.strokeDashoffset = "0";
                            InfoContainer.style.display = "none";
                            Status.innerText = "PENDING";
                            
                        } else if (Info["Completed"] != null) {
    
                            if (Info["Completed"] === 1) {} //Completed with error
                            Percent.innerText = "100%";
                            ProgressCircle.style.strokeDashoffset = "0";
                            ProgressCircle.style.stroke = "rgb(83, 219, 59)";
                            InfoContainer.style.display = "none";
                            Status.innerText = "COMPLETED";
    
                        } else if (Info["Progress"] != null) {
                            let Progress = Info["Progress"];
    
                            if (Progress["status"] != "started" && Progress["status"] != "finished") {
                                let Percentage = parseInt(Progress["_percent_str"]);
                                Percent.innerText = Percentage + "%";
    
                                let PercentMax = parseInt(getComputedStyle(ProgressCircle).strokeDasharray);
                                ProgressCircle.style.strokeDashoffset = Math.abs((PercentMax * (Percentage/100)) - PercentMax);
                                InfoContainer.querySelector(".Video-Eta").innerText = ToTimestamp(Progress["eta"]);
                                let VideoSpeed = InfoContainer.querySelector(".Video-Speed")

                                if (Progress["bitrate"]) {
                                    VideoSpeed.innerText = Math.round(parseFloat(Progress["bitrate"])/100)/10 + "mbit/s"
                                } else if (Progress["speed"]) {
                                    VideoSpeed.innerText = Math.round((Progress["speed"]/Math.pow(10, 6))*10)/10 + "MB/s"
                                }
                                InfoContainer.style.display = "flex";
                            }
    
                            if (Progress["type"] == "PostProcess") {
                                ProgressCircle.style.stroke = "rgb(237, 223, 92)";
                                Status.innerText = "POST PROCESSING";
                            } else if (Progress["type"] == "Download") {
                                ProgressCircle.style.stroke = "rgb(130, 240, 110)";
                                Status.innerText = "DOWNLOADING";
                            }
                        }
                    }
                }
                if (DLQueue.childElementCount == 1) {
                    ShowEmpty();
                } else { EmptyQueue.style.display = "none"; }
            });
            break;
        case 404:
            console.log('Not Found');
            break;
    }
}
UpdateQueue()