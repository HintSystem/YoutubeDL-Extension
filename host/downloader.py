#!/usr/bin/python -u

# Note that running python with the `-u` flag is required on Windows

import sys
import json
import struct
import os

from math import floor
import threading
import subprocess
import traceback
import re

import yt_dlp

def ToSeconds(Timestamp):
    NumSplit = Timestamp.split(":")
    return (int(NumSplit[0])*3600) + (int(NumSplit[1])*60) + float(NumSplit[2])

# Read a message from stdin and decode it.
def get_message():
    raw_length = sys.stdin.buffer.read(4)

    if not raw_length: 
        sys.exit(0)
    message_length = struct.unpack('=I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)

# Encode a message for transmission, given its content.
def encode_message(message_content):
    encoded_content = json.dumps(message_content).encode("utf-8")
    encoded_length = struct.pack('=I', len(encoded_content))
    #  use struct.pack("10s", bytes), to pack a string of the length of 10 characters
    return {'length': encoded_length, 'content': struct.pack(str(len(encoded_content))+"s",encoded_content)}

# Send an encoded message to stdout.
def send_message(encoded_message):
    sys.stdout.buffer.write(encoded_message['length'])
    sys.stdout.buffer.write(encoded_message['content'])
    sys.stdout.buffer.flush()

FFmpegProcess = False

class FFmpegNativePP(yt_dlp.postprocessor.FFmpegPostProcessor):
    def run(self, info):
        InFile = info["filepath"]
        OutFile = os.path.splitext(InFile)[0] + ".mp4"

        DLRange = self.get_param("DLRange")

        Args = []
        Args += ["-c:v", "copy", "-c:a", "copy"]

        if DLRange:
            Args += ["-ss", str(DLRange[0]), "-to", str(DLRange[1])]

        Args += ["-n", "-nostdin"]
        
        argv = [self.executable, "-i", info["filepath"]] + Args + [OutFile]

        send_message(encode_message({"Info": argv}))

        def FFmpeg(argv):
            global FFmpegProcess
            FFmpegProcess = subprocess.Popen(argv, stderr=subprocess.PIPE, universal_newlines=True, encoding="utf-8")
            for line in FFmpegProcess.stderr:
                if "Exiting" in line:
                    send_message(encode_message({"Error": line}))

                elif "frame=" in line:
                    VarPairs = re.split("\s+(?![0-9])(?=\w)", line) #split into index and value pairs
                    ProgressDict = {}
                    for v in VarPairs:
                        IndexValue = re.split("=\s*", v) #split into index and value
                        ProgressDict[IndexValue[0]] = IndexValue[1]

                    if "N/A" not in ProgressDict["speed"]:
                        ProgressDict["time"] = ToSeconds(ProgressDict["time"])
                        ProgressDict["_percent_str"] = str( round((ProgressDict["time"] / info["duration"])*100) ) + "%"
                        ProgressDict["time_remaining"] = max(info["duration"] - ProgressDict["time"], 0)
                        ProgressDict["eta"] = floor(ProgressDict["time_remaining"] / float( re.match("[\d\.]+", ProgressDict["speed"])[0]))

                        ProgressDict["time_remaining"] = str(ProgressDict["time_remaining"])
                        ProgressDict["time"] = str(ProgressDict["time"])
                        ProgressDict["type"] = "PostProcess"
                        send_message(encode_message({"Progress": ProgressDict}))

        FFmpeg(argv)
        global FFmpegProcess
        FFmpegProcess = False

        return [], info

class DebugLogger:
    def debug(self, msg):
        if msg.startswith('[debug] '):
            send_message(encode_message({"debug": msg}))
        else:
            self.info(msg)

    def info(self, msg):
        send_message(encode_message({"info": msg}))

    def warning(self, msg):
        send_message(encode_message({"warning": msg}))

    def error(self, msg):
        send_message(encode_message({"error": msg}))

def ProgressHook(d):
    d["type"] = "Download"
    d.pop("info_dict")
    if d["status"] == "started":
        send_message(encode_message({"Progress": d}))
    if d["status"] == "downloading":
        send_message(encode_message({"Progress": d}))
    if d["status"] == "finished":
        send_message(encode_message({"Progress": d}))

def FFmpegHook(d):
    d["type"] = "PostProcess"
    d.pop("info_dict")
    if d["status"] == "started":
        send_message(encode_message({"Progress": d}))
    if d["status"] == "finished":
        send_message(encode_message({"Progress": d}))

VideoThread = False
DefaultDir = os.path.abspath("..\\downloads")

while True:
    message = get_message()
    if message:

        if (VideoThread == False or not VideoThread.is_alive()) and "Url" in message:
            send_message(encode_message(message))
            VideoInfo = message

            OutDir = DefaultDir
            if "OutDir" in message:
                OutDir = os.path.expandvars(os.path.normpath(VideoInfo["OutDir"]))
                if os.path.exists(OutDir):
                    if os.path.isfile(OutDir):
                        OutDir = os.path.split(OutDir)[0]
                else:
                    OutDir = DefaultDir

            def StartDownload():
                ydl_opts = message
                ydl_opts["logger"] = DebugLogger()
                ydl_opts["progress_hooks"] = [ProgressHook]
                ydl_opts["postprocessor_hooks"] = [FFmpegHook]
                ydl_opts["ffmpeg_location"] = os.getcwd()
                ydl_opts["paths"] = {
                    "home": OutDir
                }

                # def DownloadRange(info_dict, ydl):
                #     send_message(encode_message({"start_time": message["DLRange"][0], "end_time": message["DLRange"][1]}))
                #     return [{"start_time": message["DLRange"][0], "end_time": message["DLRange"][1]}]

                # ydl_opts["download_ranges"] = DownloadRange
                # ydl_opts["force_keyframes_at_cuts"] = True

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    try:
                        ydl.add_post_processor(FFmpegNativePP(), when='post_process')
                        ydl.download([VideoInfo["Url"]])
                        send_message(encode_message({"Completed": VideoInfo["id"]}))
                    except Exception as Except:
                        send_message(encode_message({"Critical Error": str(Except), "Traceback": traceback.format_exc()}))
                        raise Except

            VideoThread = threading.Thread(target=StartDownload)
            VideoThread.daemon = True
            VideoThread.start()
        elif "Cancel" in message:
            if FFmpegProcess:
                FFmpegProcess.terminate()
                send_message(encode_message({"Cancelled": "While ffmpeg was running"}))
            elif VideoThread and VideoThread.is_alive():
                send_message(encode_message({"Cancelled": "While downloading"}))
            else:
                send_message(encode_message({"Cancelled": "while inactive"}))
            sys.exit()
        elif "GetDir" in message:
            send_message(encode_message({"GetDir": DefaultDir}))
