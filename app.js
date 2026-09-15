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

        // Read JPG raw binary
        const jpgBuffer = await file.arrayBuffer();
        const jpgData = new Uint8Array(jpgBuffer);

        const jpgSize = jpgData.length;

        statusText.textContent =
            `Sending ${file.name}, ${jpgSize} bytes...`;

        console.log("JPG size =", jpgSize);

        // ------------------------------------------------
        // Build packet:
        // [4-byte little-endian JPG size][JPG raw data]
        // ------------------------------------------------

        const txData = new Uint8Array(4 + jpgSize);

        txData[0] = (jpgSize) & 0xFF;
        txData[1] = (jpgSize >> 8) & 0xFF;
        txData[2] = (jpgSize >> 16) & 0xFF;
        txData[3] = (jpgSize >> 24) & 0xFF;

        txData.set(jpgData, 4);

        console.log("Total TX =", txData.length);
        console.log(
            "Header =",
            txData[0],
            txData[1],
            txData[2],
            txData[3]
        );

        // ------------------------------------------------
        // Bulk OUT
        // OUT_EP = 3  -> USB EP 0x03
        // ------------------------------------------------

        const startTime = performance.now();

        const result = await device.transferOut(
            OUT_EP,
            txData
        );

        const endTime = performance.now();

        const elapsed = endTime - startTime;

        console.log("transferOut status =", result.status);
        console.log("bytesWritten =", result.bytesWritten);
        console.log("time =", elapsed, "ms");

        if (result.status !== "ok") {
            statusText.textContent =
                `Bulk OUT failed: ${result.status}`;
            return;
        }

        statusText.textContent =
            `TX OK: ${result.bytesWritten} bytes, ` +
            `${elapsed.toFixed(2)} ms`;

    } catch (error) {

        console.error("JPG TX Error:", error);

        statusText.textContent =
            "JPG TX Error: " +
            error.name + ": " +
            error.message;
    }
});