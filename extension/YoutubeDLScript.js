let DefaultDirectory = null;
let OutDirectory = null;
chrome.runtime.sendMessage({"GetDir": true}, function(Response) { DefaultDirectory = Response; })

let DownloadPopup;
var ActiveMarkers = {
    In: null,
    Out: null
};

let VideoElement = document.getElementsByClassName("video-stream")[0];
var Video = {
    Get() {
        if (VideoElement == null) { VideoElement = document.getElementsByClassName("video-stream")[0]; }
        return VideoElement;
    },

    Url() { return Video.Get().baseURI; },
    Duration() { return Video.Get().duration },
    CurrentTime() { return Video.Get().currentTime }
}

function RequestDownload () {
    let Title = document.querySelector("h1.title.ytd-video-primary-info-renderer").textContent;
    let Url = Video.Url();
    let Id = new URL(Url).searchParams.get("v");

    let In = ActiveMarkers.In.Time;
    let Out = ActiveMarkers.Out.Time;

    let DLRange = false;

    if (In == null) { In = 0; }
    if (Out == null) { Out = 0; }

    if (!(In == 0 && Out == 0)) {
        if (Out == 0) { Out = Video.Duration() }
        DLRange = [In, Out]
    } else { console.log("No markers found") }

    let Message = {
        Url: Url,
        DLRange: DLRange,
        id: Id,
        title: Title, 
        thumbnail: "https://i.ytimg.com/vi/" + Id + "/hqdefault.jpg?"
    }
    if (OutDirectory != null) { Message["OutDir"] = OutDirectory; }

    chrome.runtime.sendMessage(Message);
}

var Timestamp = {
    __FormatToSeconds: function(TimeArray) {
        let Result = (parseInt(TimeArray.Minutes)*60) + parseInt(TimeArray.Seconds) + (parseInt(TimeArray.Miliseconds)/Math.pow(10, TimeArray.Miliseconds.length));
        console.log(Result);
        return Result;
    },

    ToSeconds: function(Time) {
        console.log("CONVERTING TO SECONDS", Time);
        let TimeArray = {Minutes: "0", Seconds: "0", Miliseconds: "0"};

        let TimeSplit = Time.split(":");
        if (TimeSplit.length == 2) {
            TimeArray.Minutes = TimeSplit[0];
            TimeArray.Seconds = TimeSplit[1];

            let SecondSplit = TimeArray.Seconds.split(".");
            if (SecondSplit.length == 2) {
                TimeArray.Seconds = SecondSplit[0];
                TimeArray.Miliseconds = SecondSplit[1];

                console.log("all present");
                return Timestamp.__FormatToSeconds(TimeArray); // Return because all values were received
            } else if (SecondSplit.length != 1) { return false; }

            console.log("minutes seconds");
            return Timestamp.__FormatToSeconds(TimeArray); // Return because minutes and seconds were received
        } else if (TimeSplit.length != 1) { return false; }

        let SecondSplit = Time.split(".");
        if (SecondSplit.length == 2) {
            TimeArray.Seconds = SecondSplit[0];
            TimeArray.Miliseconds = SecondSplit[1];

            console.log("seconds and mili");
            return Timestamp.__FormatToSeconds(TimeArray); // Return because seconds and miliseconds were received
        } else if (!isNaN(Time)) {
            TimeArray.Seconds = Time;

            console.log("seconds");
            return this.__FormatToSeconds(TimeArray); // Return because seconds were received
        } else { return false; }
    },

    Create: function(Seconds) {
        let Miliseconds = 0;
        if (!Number.isInteger(Seconds)) { Miliseconds = Seconds.toString().split(".")[1].substring(0, 1) }
    
        let Minutes = Math.floor(Seconds/60);
    
        Seconds = Math.floor(Seconds - Minutes*60);
        if (Seconds < 10) { Seconds = "0" + Seconds};
    
        return Minutes + ":" + Seconds + "." + Miliseconds;
    }
};

class Popup {
    constructor () { this.__element = null; }

    get Element() { //Safe version of __element which checks for popup existance beforehand
        if (this.__element == null) { this.Create(); }
        return this.__element;
    }

    Create() {
        let PopupContainer = document.getElementsByTagName("ytd-popup-container")[0];
        let Popup = document.getElementsByClassName("YoutubeDL-Popup-Container")[0];

        if (PopupContainer == null) { console.log("POPUP CONTAINER DOESN'T EXIST"); }

        if (Popup == null) {
            Popup = document.createElement("tp-yt-paper-dialog");
            Popup.className = "style-scope ytd-popup-container " + "YoutubeDL-Popup-Container";

            let PopupDiv = document.createElement("div");
            PopupDiv.className = "style-scope ytd-popup-container " + "YoutubeDL-Popup";
            PopupDiv.style.cssText = "min-width: 200px; max-width: 400px; padding: 0 16px";
            PopupDiv.tabIndex = "-1";
            PopupDiv.setAttribute("dialog", "true");

            let TitleHeader = document.createElement("div");
            TitleHeader.className = "YoutubeDL-Title-Header";

            let Title = document.createElement("a");
            Title.className = "YoutubeDL-Title";
            Title.innerText = "Download this video";
            TitleHeader.append(Title);

            let InputDiv = document.createElement("div");
            InputDiv.className = "YoutubeDL-Input-Container";

            let Spacer = document.createElement("span");
            Spacer.className = "YoutubeDL-Spacer";
            Spacer.innerText = "\u2013";

            let InputIn = CreateYTInput();
            let InputOut = CreateYTInput();

            InputIn.addEventListener("change", () => { ActiveMarkers.In.Move(Timestamp.ToSeconds(InputIn.value)); })
            InputOut.addEventListener("change", () => { ActiveMarkers.Out.Move(Timestamp.ToSeconds(InputOut.value)); })

            InputDiv.append(InputIn);
            InputDiv.append(Spacer);
            InputDiv.append(InputOut);

            let Buttons = document.createElement("div");
            Buttons.className = "YoutubeDL-Popup-Buttons";

            let CancelButton = CreateYTButton("Cancel", "YoutubeDL-Button-Secondary");
            let DownloadButton = CreateYTButton("Download", "YoutubeDL-Button-Primary");
            CancelButton.addEventListener('click', () => { this.Hide(); })
            DownloadButton.addEventListener('click', () => { RequestDownload(); })

            let OutputDir = document.createElement("div");
            OutputDir.className = "YoutubeDL-OutputDir-Container";

            let OutputText = document.createElement("input");
            OutputText.className = "YoutubeDL-Dir-Text";
            OutputText.disabled = true;
            OutputText.value = DefaultDirectory;

            function SwapButton(Disabled) {
                if (Disabled == false) {
                    OutputText.disabled = true;
                    OutputButton.style.pointerEvents = "auto";
                    OutputButton.textContent = "Edit";
                } else {
                    OutputText.disabled = false;
                    OutputButton.style.pointerEvents = "none";
                    OutputButton.textContent = "Save";
                    OutputText.focus();
                }
            }

            OutputText.addEventListener("change", () => {
                if (OutputText.value != "") {
                    OutDirectory = OutputText.value;
                } else { OutDirectory = null; OutputText.value = DefaultDirectory; }
                SwapButton(false);
            })
            OutputText.addEventListener("focusout", () => { SwapButton(false); })

            let OutputButton = document.createElement("a");
            OutputButton.className = "YoutubeDL-Button YoutubeDL-Button-Secondary";
            OutputButton.innerText = "Edit";

            OutputButton.addEventListener("click", () => { if (OutputButton.disabled = true) { SwapButton(true); }})

            PopupDiv.append(TitleHeader);

            PopupDiv.append(InputDiv);

            OutputDir.append(OutputText);
            OutputDir.append(OutputButton);
            PopupDiv.append(OutputDir);

            Buttons.append(CancelButton);
            Buttons.append(DownloadButton);
            PopupDiv.append(Buttons);

            Popup.append(PopupDiv);
            PopupContainer.append(Popup);
        }
        this.__element = Popup;
    }

    Show() {
        this.UpdateTimestamps()

        if (this.Element.style.display == "block") {
            this.Hide();
            return;
        }

        this.Element.style.display = "block";

        // let Backdrop = document.createElement("tp-yt-iron-overlay-backdrop");
        // Backdrop.style.cssText = "z-index: 2201";
        // Backdrop.className = "opened";
    }

    Hide() {
        this.Element.style.display = "none";
    }

    UpdateTimestamps() {
        let Inputs = this.Element.getElementsByClassName("YoutubeDL-Input");
        let Duration = Video.Duration();

        Inputs[0].value = Timestamp.Create(ActiveMarkers.In.Time);

        if (isNaN(ActiveMarkers.Out.Time) || ActiveMarkers.Out.Time == 0) { //Set to duration if out time doesn't exist
            Inputs[1].value = Timestamp.Create(Duration);
        } else {
            Inputs[1].value = Timestamp.Create(ActiveMarkers.Out.Time);
        }
        console.log(Timestamp.ToSeconds(Inputs[0].value), Timestamp.ToSeconds(Inputs[1].value));
    }
}

function areMarkersVisible() {
    if (ActiveMarkers.In != null && ActiveMarkers.In.Visible) {
        if (ActiveMarkers.Out != null && ActiveMarkers.Out.Visible) {
            return true;
        }
    }
    return false;
}

class Marker {
    constructor(Mode) {
        if (Mode == "In" || Mode == "Out") {
            let ProgressBar = document.getElementsByClassName("ytp-progress-bar-container")[0];
    
            let MarkerContainer = document.getElementsByClassName("YoutubeDL-Marker-Container")[0];
            if (MarkerContainer == null) {
                MarkerContainer = document.createElement("div");
                MarkerContainer.className = "YoutubeDL-Marker-Container";
                ProgressBar.append(MarkerContainer);
            }
    
            let SecondClass = "YoutubeDL-Marker-" + Mode;
            if (Mode == "In") {SecondClass = "YoutubeDL-Marker-In";} else if (Mode == "Out") {SecondClass = "YoutubeDL-Marker-Out";}
    
            this.Marker = document.getElementsByClassName(SecondClass)[0];
            if (this.Marker == null) {
                this.Marker = document.createElement("img");
                this.Marker.className = "YoutubeDL-Marker " + SecondClass;
                this.Marker.style.cssText = "bottom: 5px; position: absolute; width: 18px; transform: translate(-50%); shape-rendering: crisp-edges; cursor: default; display: none";
                this.Marker.src = chrome.runtime.getURL("/icons/marker-icon.svg");
                MarkerContainer.append(this.Marker);
            }
            this.Time = 0;
            this.Visible = false;
            this.Mode = Mode;
        }
    }

    Remove() {
        this.Marker.style.display = "none";
        this.Time = 0;
        this.Visible = false;
    }

    Restore() {
        this.Marker.style.display = "block"
        this.Visible = true
    }

    Move(MoveTime) {
        let Duration = Video.Duration();
        let CurrentTime = Video.CurrentTime();

        if (!isNaN(MoveTime)) { CurrentTime = MoveTime }
        if (CurrentTime > Duration) { CurrentTime = Duration } //Limit CurrentTime to end of video
        if (this.Mode == "Out" && CurrentTime == Duration) { CurrentTime = 0 } //Mark for deletion if Out marker is at end of video

        if (this.Time == CurrentTime || CurrentTime == 0) { this.Remove(); } else { //Delete marker if same time entered twice or if default value
            if (this.Mode == "In") { //Don't let In marker get ahead of Out marker
                if (CurrentTime >= ActiveMarkers.Out.Time && ActiveMarkers.Out.Time != 0) {CurrentTime = ActiveMarkers.Out.Time - 1;}
            } else if (this.Mode == "Out") {
                if (CurrentTime <= ActiveMarkers.In.Time && ActiveMarkers.In.Time != 0) {CurrentTime = ActiveMarkers.In.Time + 1;}
            }
            this.Restore();
            this.Time = CurrentTime;
        }

        let MarkerPos = (CurrentTime/Duration) * 100;
        this.Marker.style.left = MarkerPos + "%";

        DownloadPopup.UpdateTimestamps();

        let MarkerContainer = this.Marker.parentNode;
        let MarkerLine = MarkerContainer.getElementsByClassName("YoutubeDL-Marker-Line")[0];
        if (areMarkersVisible()) {
            console.log("IN-OUT CREATED");

            if (MarkerLine == null) {
                MarkerLine = document.createElement("div");
                MarkerLine.className = "YoutubeDL-Marker-Line";
                MarkerLine.style.cssText = "height: 3px; background-color: #00aeef; bottom: 8px; position: absolute";
                MarkerContainer.append(MarkerLine);
            }

            MarkerLine.style.width = ((ActiveMarkers.Out.Time - ActiveMarkers.In.Time)/Duration) * 100 + "%";
            MarkerLine.style.left = ActiveMarkers.In.Marker.style.left;
        } else if (MarkerLine != null) { MarkerContainer.removeChild(MarkerLine); }
    }
}

function AddTooltip(Element) {
    let Tooltip = document.getElementsByClassName("ytp-tooltip-text-wrapper")[0].parentNode;

    Element.addEventListener('mouseenter', () => {
        setTimeout(() => {
            Tooltip.ariaHidden = "false";
            Tooltip.className = "ytp-tooltip ytp-bottom";
            Tooltip.getElementsByClassName("ytp-tooltip-text")[0].innerText = Element.ariaLabel;
            Tooltip.getElementsByClassName("ytp-tooltip-bg")[0].style.cssText = "width: 158px; height: 90px";

            ElementPos = Element.getBoundingClientRect();
            ElementTop = (ElementPos.top - 105) + document.documentElement.scrollTop;

            Tooltip.style.cssText = "max-width: 300px; top: " + ElementTop + "px";

            ElementLeft = ElementPos.left - (Tooltip.clientWidth/2) + (Element.clientWidth/2);
            Tooltip.style.cssText = Tooltip.style.cssText + "left: " + ElementLeft + "px";
        }, 90)
    })

    Element.addEventListener('mouseleave', () => {
        Tooltip.ariaHidden = "true";
    })
}

function CreateYTButton(Text, Class) {
    if (Class == null) { Class = "YoutubeDL-Button-Primary"; }

    let Button = document.createElement("div");
    Button.className = "YoutubeDL-Button " + Class;

    let Label = document.createElement("a");
    Label.className = "YoutubeDL-Button-Label";
    Label.innerText = Text;

    Button.append(Label);
    return Button;
}

function CreateYTInput() {
    let Input = document.createElement("input");
    Input.className = "YoutubeDL-Input";

    Input.addEventListener("submit", function() {
        console.log("ENTER PRESSED");
    })
    Input.addEventListener("beforeinput", function(Event) {
        if (Event.inputType != "deleteContentBackward") {
            if (!(/[\d\.\:]/g.test(Event.data))) {
                Event.preventDefault();
            }
        }
    })

    return Input;
}

//Hide markers on new video
function Reset() {
    console.log("Reset");
    let MarkerContainer = document.getElementsByClassName("YoutubeDL-Marker-Container")[0];
    if (MarkerContainer != null) {
        ActiveMarkers.In.Remove();
        ActiveMarkers.Out.Remove();

        let MarkerLine = MarkerContainer.getElementsByClassName("YoutubeDL-Marker-Line")[0];
        if (MarkerLine != null) { MarkerLine.remove(); }
    }
}

function WaitForQuery(Query) {
    return new Promise(Resolve => {
        let Element = document.querySelector(Query);
        if (Element) { console.log("Await completed instantly!"); return Resolve(Element); }

        let Observer = new MutationObserver((Mutations, Observer) => {
            let Element = document.querySelector(Query)
            if (Element) {
                Resolve(Element);
                console.log("Await completed!"); 
                Observer.disconnect();
            }
        })
        Observer.observe(document.body, {childList: true, subtree: true});
    })
}

function CreateButtons() {
    let VideoControls = document.getElementsByClassName("ytp-right-controls")[0];

    if (VideoControls == null) { console.log("NO VIDEO CONTROLS FOUND"); }
    
    if (VideoControls.getElementsByClassName("YoutubeDL-Player-Button").length == 0) {
        console.log("Creating buttons . . .", VideoControls)
        let InButton = document.createElement("img");
        InButton.className = "ytp-button " + "YoutubeDL-Player-Button";
        InButton.style.cssText = "height: 28px; width: auto; margin: 1px; padding: 7px"
        InButton.ariaLabel = "Marker in (q)";
        InButton.src = chrome.runtime.getURL("/icons/marker-in.svg");
    
        let OutButton = InButton.cloneNode();
        OutButton.ariaLabel = "Marker out (e)";
        OutButton.src = chrome.runtime.getURL("/icons/marker-out.svg");

        let Download = InButton.cloneNode();
        Download.ariaLabel = "Download (d)";
        Download.src = chrome.runtime.getURL("/icons/download.svg");

        AddTooltip(InButton);
        AddTooltip(OutButton);
        AddTooltip(Download);

        ActiveMarkers.In = new Marker("In");
        ActiveMarkers.Out = new Marker("Out");
        DownloadPopup = new Popup();

        InButton.addEventListener('click', () => { ActiveMarkers.In.Move(); });
        OutButton.addEventListener('click', () => { ActiveMarkers.Out.Move(); });
        Download.addEventListener('click', () => { DownloadPopup.Show(); });

        document.onkeydown = function(Event) {
            let Acceptable = false;
            if (Event.path.includes(document.querySelector("#player-theater-container"))
            || Event.path.includes(document.querySelector("ytd-popup-container"))
            || Event.target == document.body) {
                Acceptable = true;
            }

            if (Event.repeat || !Acceptable) { return; }

            if (Event.key == "q") {
                InButton.click();
            } else if (Event.key == "e") {
                OutButton.click();
            } else if (Event.key == "d") { Download.click(); }
        }

        console.log("Appending buttons . . .", InButton, OutButton, Download);
        VideoControls.prepend(Download, InButton, OutButton);
        console.dir(VideoControls);
    }
}

console.log("LISTENER CREATED");
chrome.runtime.onMessage.addListener((Response) => {
    console.log("LISTENER ACTIVATED", ActiveMarkers.In, ActiveMarkers.Out);
    Reset();
    CreateButtons();
});