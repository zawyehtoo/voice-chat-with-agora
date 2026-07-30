import './style.css'
import AgoraRTC from "agora-rtc-sdk-ng"
import AgoraRTM from "agora-rtm-sdk"

const appid = import.meta.env.VITE_APP_ID


const token = null

const rtcUid =  Math.floor(Math.random() * 2032)
const rtmUid =  String(Math.floor(Math.random() * 2032))

const getRoomId = () => {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);

  if (urlParams.get('room')){
    return urlParams.get('room').toLowerCase()
  }
}

let roomId = getRoomId() || null
document.getElementById('form').roomname.value = roomId


let audioTracks = {
  localAudioTrack: null,
  remoteAudioTracks: {},
};

let localVideoTrack = null;
let localScreenTrack = null;

let micMuted = true
let cameraOff = true
let screenSharing = false
let cameraWasOnBeforeShare = false

let rtcClient;
let rtmClient;
let channel;

let avatar;


const initRtm = async (name) => {

  rtmClient = AgoraRTM.createInstance(appid)
  await rtmClient.login({'uid':rtmUid, 'token':token})

  channel = rtmClient.createChannel(roomId)
  await channel.join()

  await rtmClient.addOrUpdateLocalUserAttributes({'name':name, 'userRtcUid':rtcUid.toString(), 'userAvatar':avatar, 'micMuted':micMuted.toString()})

  getChannelMembers()

  window.addEventListener('beforeunload', leaveRtmChannel)

  channel.on('MemberJoined', handleMemberJoined)
  channel.on('MemberLeft', handleMemberLeft)
  channel.on('ChannelMessage', handleChannelMessage)
}



const initRtc = async () => {
  rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });


  //rtcClient.on('user-joined', handleUserJoined)
  rtcClient.on("user-published", handleUserPublished)
  rtcClient.on("user-unpublished", handleUserUnpublished)
  rtcClient.on("user-left", handleUserLeft);
  

  await rtcClient.join(appid, roomId, token, rtcUid)
  audioTracks.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
  audioTracks.localAudioTrack.setMuted(micMuted)
  await rtcClient.publish(audioTracks.localAudioTrack);


  //document.getElementById('members').insertAdjacentHTML('beforeend', `<div class="speaker user-rtc-${rtcUid}" id="${rtcUid}"><p>${rtcUid}</p></div>`)

  initVolumeIndicator()
}

let initVolumeIndicator = async () => {

  //1
  AgoraRTC.setParameter('AUDIO_VOLUME_INDICATION_INTERVAL', 200);
  rtcClient.enableAudioVolumeIndicator();
  
  //2
  rtcClient.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
      console.log(`UID ${volume.uid} Level ${volume.level}`);

      //3
      try{
          let items = document.getElementsByClassName(`avatar-${volume.uid}`)

          for (let i = 0; items.length > i; i++){
            if (volume.level >= 50){
              items[i].style.borderColor = '#00ff00'
            }else{
              items[i].style.borderColor = "#fff"
            }
          }
      }catch(error){
        console.error(error)
      }


    });
  })
}


// let handleUserJoined = async (user) => {
//   document.getElementById('members').insertAdjacentHTML('beforeend', `<div class="speaker user-rtc-${user.uid}" id="${user.uid}"><p>${user.uid}</p></div>`)
// } 

// the member card is added by RTM, which can resolve after RTC fires
// user-published — poll briefly until the card exists
let waitForElement = async (id) => {
  for (let i = 0; i < 20; i++){
    let element = document.getElementById(id)
    if (element){
      return element
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return null
}

let displayRemoteVideo = async (user) => {
  let videoWrapper = await waitForElement(`video-wrapper-${user.uid}`)
  if (!videoWrapper){
    return
  }
  videoWrapper.style.display = 'block'
  user.videoTrack.play(`video-wrapper-${user.uid}`)

  let avatarImg = document.getElementsByClassName(`user-avatar avatar-${user.uid}`)[0]
  if (avatarImg){
    avatarImg.style.display = 'none'
  }
}

let hideRemoteVideo = (uid) => {
  let videoWrapper = document.getElementById(`video-wrapper-${uid}`)
  if (videoWrapper){
    videoWrapper.style.display = 'none'
    videoWrapper.innerHTML = ''
  }

  let avatarImg = document.getElementsByClassName(`user-avatar avatar-${uid}`)[0]
  if (avatarImg){
    avatarImg.style.display = 'block'
  }
}

let handleUserPublished = async (user, mediaType) => {
  await  rtcClient.subscribe(user, mediaType);

  if (mediaType == "audio"){
    audioTracks.remoteAudioTracks[user.uid] = [user.audioTrack]
    user.audioTrack.play();
  }

  if (mediaType == "video"){
    displayRemoteVideo(user)
  }
}

let handleUserUnpublished = async (user, mediaType) => {
  if (mediaType == "video"){
    hideRemoteVideo(user.uid)
  }
}

let handleUserLeft = async (user) => {
  delete audioTracks.remoteAudioTracks[user.uid]
  //document.getElementById(user.uid).remove()
}

let micStatusHtml = (userRtcUid, muted) => `
    <img class="mic-status mic-status-${userRtcUid}" src="/icons/${muted == 'true' ? 'mic-off' : 'mic'}.svg" style="background-color: ${muted == 'true' ? 'indianred' : 'ivory'};"/>`

let handleMemberJoined = async (MemberId) => {

  let {name, userRtcUid, userAvatar, micMuted} = await rtmClient.getUserAttributesByKeys(MemberId, ['name', 'userRtcUid', 'userAvatar', 'micMuted'])

  let newMember = `
  <div class="speaker user-rtc-${userRtcUid}" id="${MemberId}">
    <img class="user-avatar avatar-${userRtcUid}" src="${userAvatar}"/>
    <div class="video-wrapper avatar-${userRtcUid}" id="video-wrapper-${userRtcUid}"></div>
    ${micStatusHtml(userRtcUid, micMuted)}
      <p>${name}</p>
  </div>`

  document.getElementById("members").insertAdjacentHTML('beforeend', newMember)
}

let handleMemberLeft = async (MemberId) => {
  document.getElementById(MemberId).remove()
}

let getChannelMembers = async () => {
  let members = await channel.getMembers()

  for (let i = 0; members.length > i; i++){

    let {name, userRtcUid, userAvatar, micMuted} = await rtmClient.getUserAttributesByKeys(members[i], ['name', 'userRtcUid', 'userAvatar', 'micMuted'])

    let newMember = `
    <div class="speaker user-rtc-${userRtcUid}" id="${members[i]}">
        <img class="user-avatar avatar-${userRtcUid}" src="${userAvatar}"/>
        <div class="video-wrapper avatar-${userRtcUid}" id="video-wrapper-${userRtcUid}"></div>
        ${micStatusHtml(userRtcUid, micMuted)}
        <p>${name}</p>
    </div>`

    document.getElementById("members").insertAdjacentHTML('beforeend', newMember)
  }
}

let setMicStatusIcon = (uid, muted) => {
  let icons = document.getElementsByClassName(`mic-status-${uid}`)
  for (let i = 0; icons.length > i; i++){
    icons[i].src = muted ? '/icons/mic-off.svg' : '/icons/mic.svg'
    icons[i].style.backgroundColor = muted ? 'indianred' : 'ivory'
  }
}

let handleChannelMessage = async (message) => {
  let data = JSON.parse(message.text)

  if (data.type == 'mic'){
    setMicStatusIcon(data.uid, data.muted)
  }
}

const toggleMic = async (e) => {
  if (micMuted){
    e.target.src = '/icons/mic.svg'
    e.target.style.backgroundColor = 'ivory'
    micMuted = false
  }else{
    e.target.src = '/icons/mic-off.svg'
    e.target.style.backgroundColor = 'indianred'
    
    micMuted = true
  }
  audioTracks.localAudioTrack.setMuted(micMuted)

  setMicStatusIcon(rtcUid, micMuted)
  await rtmClient.addOrUpdateLocalUserAttributes({'micMuted': micMuted.toString()})
  await channel.sendMessage({text: JSON.stringify({type: 'mic', uid: rtcUid, muted: micMuted})})
}

const toggleCamera = async (e) => {
  if (screenSharing){
    alert('Please stop screen sharing before toggling your camera')
    return
  }

  if (cameraOff){
    if (!localVideoTrack){
      localVideoTrack = await AgoraRTC.createCameraVideoTrack()
      await rtcClient.publish(localVideoTrack)
    }else{
      await localVideoTrack.setEnabled(true)
    }

    let videoWrapper = await waitForElement(`video-wrapper-${rtcUid}`)
    if (videoWrapper){
      videoWrapper.style.display = 'block'
      localVideoTrack.play(`video-wrapper-${rtcUid}`)
    }

    let avatarImg = document.getElementsByClassName(`user-avatar avatar-${rtcUid}`)[0]
    if (avatarImg){
      avatarImg.style.display = 'none'
    }

    e.target.src = '/icons/video.svg'
    e.target.style.backgroundColor = 'ivory'
    cameraOff = false
  }else{
    await localVideoTrack.setEnabled(false)
    hideRemoteVideo(rtcUid)

    e.target.src = '/icons/video-off.svg'
    e.target.style.backgroundColor = 'indianred'
    cameraOff = true
  }
}


let stopScreenShare = async () => {
  if (!localScreenTrack){
    return
  }

  await rtcClient.unpublish(localScreenTrack)
  localScreenTrack.stop()
  localScreenTrack.close()
  localScreenTrack = null
  screenSharing = false

  let screenIcon = document.getElementById('screen-icon')
  screenIcon.src = '/icons/screen-share-off.svg'
  screenIcon.style.backgroundColor = 'indianred'

  if (cameraWasOnBeforeShare && localVideoTrack){
    await rtcClient.publish(localVideoTrack)
    let videoWrapper = await waitForElement(`video-wrapper-${rtcUid}`)
    if (videoWrapper){
      videoWrapper.style.display = 'block'
      localVideoTrack.play(`video-wrapper-${rtcUid}`)
    }
  }else{
    hideRemoteVideo(rtcUid)
  }
}

const toggleScreenShare = async (e) => {
  if (screenSharing){
    await stopScreenShare()
    return
  }

  let screenTrack
  try{
    screenTrack = await AgoraRTC.createScreenVideoTrack({}, "disable")
  }catch(error){
    // user cancelled the screen picker, or denied permission
    console.error(error)
    return
  }

  localScreenTrack = screenTrack

  cameraWasOnBeforeShare = !cameraOff
  if (!cameraOff){
    await rtcClient.unpublish(localVideoTrack)
  }

  await rtcClient.publish(localScreenTrack)

  let videoWrapper = await waitForElement(`video-wrapper-${rtcUid}`)
  if (videoWrapper){
    videoWrapper.style.display = 'block'
    localScreenTrack.play(`video-wrapper-${rtcUid}`)
  }

  let avatarImg = document.getElementsByClassName(`user-avatar avatar-${rtcUid}`)[0]
  if (avatarImg){
    avatarImg.style.display = 'none'
  }

  // fires when the user clicks the browser's own "Stop sharing" control
  localScreenTrack.on('track-ended', stopScreenShare)

  e.target.src = '/icons/screen-share.svg'
  e.target.style.backgroundColor = 'ivory'
  screenSharing = true
}


let lobbyForm = document.getElementById('form')

const enterRoom = async (e) => {
  e.preventDefault()

  if (!avatar){
    alert('Please select an avatar')
    return
  }

  roomId = e.target.roomname.value.toLowerCase();
  window.history.replaceState(null, null, `?room=${roomId}`);

  initRtc()

  let displayName = e.target.displayname.value;
  initRtm(displayName)

  lobbyForm.style.display = 'none'
  document.getElementById('room-header').style.display = "flex"
  document.getElementById('room-name').innerText = roomId
}

let leaveRtmChannel = async () => {
  await channel.leave()
  await rtmClient.logout()
}

let leaveRoom = async () => {
  audioTracks.localAudioTrack.stop()
  audioTracks.localAudioTrack.close()

  if (localVideoTrack){
    localVideoTrack.stop()
    localVideoTrack.close()
    localVideoTrack = null
  }
  cameraOff = true
  let cameraIcon = document.getElementById('camera-icon')
  cameraIcon.src = '/icons/video-off.svg'
  cameraIcon.style.backgroundColor = 'indianred'

  if (localScreenTrack){
    localScreenTrack.stop()
    localScreenTrack.close()
    localScreenTrack = null
  }
  screenSharing = false
  let screenIcon = document.getElementById('screen-icon')
  screenIcon.src = '/icons/screen-share-off.svg'
  screenIcon.style.backgroundColor = 'indianred'

  rtcClient.unpublish()
  rtcClient.leave()

  leaveRtmChannel()

  document.getElementById('form').style.display = 'block'
  document.getElementById('room-header').style.display = 'none'
  document.getElementById('members').innerHTML = ''
}

lobbyForm.addEventListener('submit', enterRoom)
document.getElementById('leave-icon').addEventListener('click', leaveRoom)
document.getElementById('mic-icon').addEventListener('click', toggleMic)
document.getElementById('camera-icon').addEventListener('click', toggleCamera)
document.getElementById('screen-icon').addEventListener('click', toggleScreenShare)


const avatars = document.getElementsByClassName('avatar-selection')

for (let i=0; avatars.length > i; i++){
  
  avatars[i].addEventListener('click', ()=> {
    for (let i=0; avatars.length > i; i++){
      avatars[i].style.borderColor = "#fff"
      avatars[i].style.opacity = .5
    }

      avatar = avatars[i].src
      avatars[i].style.borderColor = "#00ff00"
      avatars[i].style.opacity = 1
  })
}