let device = null;

const VID = 0x2B41;
const PID = 0x0520;

const INTERFACE_NUM = 0;
const OUT_EP = 3;
const IN_EP = 2;

const connectButton = document.getElementById("connectButton");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");
const receiveButton = document.getElementById("receiveButton");

const jpgFile = document.getElementById("jpgFile");
const sendJpgButton = document.getElementById("sendJpgButton");

const usbSupport = document.getElementById("usbSupport");

if ("usb" in navigator) {
    usbSupport.textContent = "WebUSB supported: YES";
} else {
    usbSupport.textContent = "WebUSB supported: NO";
}

receiveButton.addEventListener("click", async () => {

    if (!device || !device.opened) {
        statusText.textContent = "STM32 not connected";
        return;
    }

    try {
        console.log("Waiting Bulk IN...");

        const result = await device.transferIn(IN_EP, 1);

        console.log("transferIn status =", result.status);

        if (result.status !== "ok") {
            statusText.textContent =
                "Bulk IN status = " + result.status;
            return;
        }

        const data = new Uint8Array(
            result.data.buffer,
            result.data.byteOffset,
            result.data.byteLength
        );

        console.log("Received bytes =", data.length);

        const hex = Array.from(data)
            .map(x => x.toString(16).padStart(2, "0"))
            .join(" ");

        console.log("RX =", hex);

        statusText.textContent =
            `RX ${data.length} bytes: ${hex}`;

    } catch (error) {
        console.error("Bulk IN Error:", error);
        statusText.textContent =
            "Bulk IN Error: " + error.message;
    }
});

connectButton.addEventListener("click", async () => {

    try {
        //device = await navigator.usb.requestDevice({
        //    filters: [
        //        {
        //            vendorId: VID,
        //            productId: PID
        //        }
        //    ]
        //});
        device = await navigator.usb.requestDevice({
            filters: []
        });

        await device.open();

        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }

        await device.claimInterface(INTERFACE_NUM);

        const iface = device.configuration.interfaces.find(
            x => x.interfaceNumber === INTERFACE_NUM
        );

        console.log("Interface claimed =", iface.claimed);

        statusText.textContent = "STM32 Connected";
        console.log("STM32 connected");

    } catch (error) {

        console.error("USB Error:", error);
        statusText.textContent = "USB Error: " + error.message;
    }
});


sendButton.addEventListener("click", async () => {

    if (!device || !device.opened) {
        statusText.textContent = "STM32 not connected";
        return;
    }

    try {

        const data = new Uint8Array([
            0x11,
            0x22,
            0x33,
            0x44
        ]);

        console.log("Sending:", data);

        const result = await device.transferOut(
            OUT_EP,
            data
        );

        console.log("transferOut status =", result.status);
        console.log("bytesWritten =", result.bytesWritten);

        statusText.textContent =
            `Send OK, ${result.bytesWritten} bytes`;

    } catch (error) {

        console.error("Bulk OUT Error:", error);
        statusText.textContent =
            "Bulk OUT Error: " + error.message;
    }
});

sendJpgButton.addEventListener("click", async () => {

    if (!device || !device.opened) {
        statusText.textContent = "STM32 not connected";
        return;
    }

    if (jpgFile.files.length === 0) {
        statusText.textContent = "Please select JPG";
        return;
    }

    try {
        const file = jpgFile.files[0];

        const jpgBuffer = await file.arrayBuffer();
        const jpgData = new Uint8Array(jpgBuffer);
        const jpgSize = jpgData.length;

        console.log("JPG size =", jpgSize);

        // ==========================================
        // 1. 先送 4-byte little-endian JPG size
        // ==========================================
        const header = new Uint8Array(4);

        header[0] = (jpgSize) & 0xFF;
        header[1] = (jpgSize >> 8) & 0xFF;
        header[2] = (jpgSize >> 16) & 0xFF;
        header[3] = (jpgSize >> 24) & 0xFF;

        statusText.textContent =
            `Sending header: ${jpgSize} bytes`;

        let result = await device.transferOut(
            OUT_EP,
            header
        );

        if (result.status !== "ok") {
            throw new Error(
                "Header transfer failed: " + result.status
            );
        }

        console.log(
            "Header OK:",
            result.bytesWritten,
            "bytes"
        );

        // ==========================================
        // 2. JPG 分段傳送
        // ==========================================
        const CHUNK_SIZE = 4096;

        let offset = 0;

        const startTime = performance.now();

        while (offset < jpgSize) {

            const end = Math.min(
                offset + CHUNK_SIZE,
                jpgSize
            );

            const chunk = jpgData.subarray(
                offset,
                end
            );

            result = await device.transferOut(
                OUT_EP,
                chunk
            );

            if (result.status !== "ok") {
                throw new Error(
                    `Transfer failed at offset ${offset}: ` +
                    result.status
                );
            }

            if (result.bytesWritten !== chunk.length) {
                throw new Error(
                    `Short transfer at ${offset}: ` +
                    `${result.bytesWritten}/${chunk.length}`
                );
            }

            offset += result.bytesWritten;

            statusText.textContent =
                `Sending ${offset}/${jpgSize}`;
        }

        const elapsed =
            performance.now() - startTime;

        statusText.textContent =
            `JPG TX OK: ${jpgSize} bytes, ` +
            `${elapsed.toFixed(2)} ms`;

        console.log(
            "JPG TX complete:",
            jpgSize,
            "bytes",
            elapsed,
            "ms"
        );

    } catch (error) {

        console.error(error);

        statusText.textContent =
            "JPG TX ERROR: " +
            error.name + ": " +
            error.message;
    }
});