// callService.js

class CallService {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    async startLocalStream() {
        this.localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        // Display local video stream in a video element
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = this.localStream;
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.configuration);
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remoteVideo');
            remoteVideo.srcObject = this.remoteStream;
        };

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Send the candidate to the remote peer through your signaling server
                console.log('New ICE candidate: ', event.candidate);
            }
        };
    }

    async makeCall() {
        this.createPeerConnection();
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        // Send the offer to the remote peer through your signaling server
        console.log('Call offer: ', offer);
    }

    async receiveCall(offer) {
        this.createPeerConnection();
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        // Send the answer back to the remote peer through your signaling server
        console.log('Call answer: ', answer);
    }

    endCall() {
        this.localStream.getTracks().forEach(track => track.stop());
        this.peerConnection.close();
        console.log('Call ended');
    }
}

// Export the CallService class
export default CallService;