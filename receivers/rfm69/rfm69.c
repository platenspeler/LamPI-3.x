// **********************************************************************************
// Driver definition for HopeRF RFM69W/RFM69HW, Semtech SX1231/1231H
// **********************************************************************************
// Creative Commons Attrib Share-Alike License
// You are free to use/extend this library but please abide with the CCSA license:
// http://creativecommons.org/licenses/by-sa/3.0/
// 2013-06-14 (C) felix@lowpowerlab.com
// 2013-05-04 Ported to be used on Raspi with wiringPi library raul.pablos@merlitec.com
// **********************************************************************************

#include "rfm69.h"
#include "rfm69registers.h"
#include <wiringPiSPI.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>

//#define SPI_SPEED 1000000
#define SPI_SPEED 2000000
#define SPI_DEVICE 0

//char DATA[MAX_DATA_LEN];
char _mode;       // current transceiver state
char _address;
char _powerLevel;
char _promiscuousMode;
char DATALEN;
char SENDERID;
char TARGETID; //should match _address
char PAYLOADLEN;
char ACK_REQUESTED;
char ACK_RECEIVED; /// Should be polled immediately after sending a packet with ACK request
int RSSI; //most accurate RSSI during reception (closest to the reception)
char DATA[63];
char CTLBYTE;


int rfm69_initialize(char freqBand, char nodeID, char networkID) {
char i;
const char CONFIG[][2] = {
    // Operation Mode: Sequencer ON, Listen Mode OFF, Standby mode
    /* 0x01 */ { REG_OPMODE, RF_OPMODE_SEQUENCER_ON | RF_OPMODE_LISTEN_OFF | RF_OPMODE_STANDBY },
    // Data Module: Packet mode, FSK Modulation, No Shaping (Might use Gaussian Filter)
    /* 0x02 */ { REG_DATAMODUL, RF_DATAMODUL_DATAMODE_PACKET | RF_DATAMODUL_MODULATIONTYPE_FSK | RF_DATAMODUL_MODULATIONSHAPING_00 },
    // Bit Rate More Significant Byte: 4.8 Kbps
    /* 0x03 */ { REG_BITRATEMSB, RF_BITRATEMSB_55555},
    // Bit Rate Less Significant Byte: 4.8 Kbps
    /* 0x04 */ { REG_BITRATELSB, RF_BITRATELSB_55555},
    // Frequency Deviation MSB: 5 KHz, (FDEV + BitRate/2 <= 500 KHz)
    /* 0x05 */ { REG_FDEVMSB, RF_FDEVMSB_50000},
    // Frequency Deviation LSB: 5KHz, (FDEV + BitRate/2 <= 500 KHz)
    /* 0x06 */ { REG_FDEVLSB, RF_FDEVLSB_50000},
    // RF Carrier Frequency MSB: Depending on the first parameter
    /* 0x07 */ { REG_FRFMSB, (freqBand==RF69_315MHZ ? RF_FRFMSB_315 : (freqBand==RF69_433MHZ ? RF_FRFMSB_433 : (freqBand==RF69_868MHZ ? RF_FRFMSB_868 : RF_FRFMSB_915))) },
    /* 0x08 */ { REG_FRFMID, (freqBand==RF69_315MHZ ? RF_FRFMID_315 : (freqBand==RF69_433MHZ ? RF_FRFMID_433 : (freqBand==RF69_868MHZ ? RF_FRFMID_868 : RF_FRFMID_915))) },
    /* 0x09 */ { REG_FRFLSB, (freqBand==RF69_315MHZ ? RF_FRFLSB_315 : (freqBand==RF69_433MHZ ? RF_FRFLSB_433 : (freqBand==RF69_868MHZ ? RF_FRFLSB_868 : RF_FRFLSB_915))) },

    // looks like PA1 and PA2 are not implemented on RFM69W, hence the max output power is 13dBm
    // +17dBm and +20dBm are possible on RFM69HW
    // +13dBm formula: Pout=-18+OutputPower (with PA0 or PA1**)
    // +17dBm formula: Pout=-14+OutputPower (with PA1 and PA2)**
    // +20dBm formula: Pout=-11+OutputPower (with PA1 and PA2)** and high power PA settings (section 3.3.7 in datasheet)
    ///* 0x11 */ { REG_PALEVEL, RF_PALEVEL_PA0_ON | RF_PALEVEL_PA1_OFF | RF_PALEVEL_PA2_OFF | RF_PALEVEL_OUTPUTPOWER_11111},
    ///* 0x13 */ { REG_OCP, RF_OCP_ON | RF_OCP_TRIM_95 }, //over current protection (default is 95mA)

    ///* 0x18*/ { REG_LNA,  RF_LNA_ZIN_200 | RF_LNA_CURRENTGAIN }, //as suggested by mav here: http://lowpowerlab.com/forum/index.php/topic,296.msg1571.html

    // RXBW defaults are { REG_RXBW, RF_RXBW_DCCFREQ_010 | RF_RXBW_MANT_24 | RF_RXBW_EXP_5} (RxBw: 10.4khz)
    /* 0x19 */ { REG_RXBW, RF_RXBW_DCCFREQ_010 | RF_RXBW_MANT_16 | RF_RXBW_EXP_2 }, //(BitRate < 2 * RxBw)
    /* 0x25 */ ////{ REG_DIOMAPPING1, RF_DIOMAPPING1_DIO0_01 }, //DIO0 is the only IRQ we're using
    /* 0x29 */ { REG_RSSITHRESH, 220 }, //must be set to dBm = (-Sensitivity / 2) - default is 0xE4=228 so -114dBm
    ///* 0x2d */ { REG_PREAMBLELSB, RF_PREAMBLESIZE_LSB_VALUE } // default 3 preamble bytes 0xAAAAAA
    /* 0x2e */ { REG_SYNCCONFIG, RF_SYNC_ON | RF_SYNC_FIFOFILL_AUTO | RF_SYNC_SIZE_2 | RF_SYNC_TOL_0 },
    /* 0x2f */ { REG_SYNCVALUE1, 0x2D },      //attempt to make this compatible with sync1 byte of RFM12B lib
    // Network ID on Syncvalue2
    /* 0x30 */ { REG_SYNCVALUE2, networkID },
    /* 0x37 */ { REG_PACKETCONFIG1, RF_PACKET1_FORMAT_VARIABLE | RF_PACKET1_DCFREE_OFF | RF_PACKET1_CRC_ON | RF_PACKET1_CRCAUTOCLEAR_ON | RF_PACKET1_ADRSFILTERING_OFF },
    /* 0x38 */ { REG_PAYLOADLENGTH, 66 }, //in variable length mode: the max frame size, not used in TX
    //* 0x39 */ { REG_NODEADRS, nodeID }, //turned off because we're not using address filtering
    /* 0x3C */ { REG_FIFOTHRESH, RF_FIFOTHRESH_TXSTART_FIFONOTEMPTY | RF_FIFOTHRESH_VALUE }, //TX on FIFO not empty
    /* 0x3d */ { REG_PACKETCONFIG2, RF_PACKET2_RXRESTARTDELAY_2BITS | RF_PACKET2_AUTORXRESTART_ON | RF_PACKET2_AES_OFF }, //RXRESTARTDELAY must match transmitter PA ramp-down time (bitrate dependent)
    /* 0x6F */ { REG_TESTDAGC, RF_DAGC_IMPROVED_LOWBETA0 }, // run DAGC continuously in RX mode, recommended default for AfcLowBetaOn=0
    {255, 0}
  };

  // Initialize SPI device 0
  if(wiringPiSPISetup(SPI_DEVICE, SPI_SPEED) < 0) {
    fprintf(stderr, "Unable to open SPI device\n\r");
    exit(1);
  }

  do rfm69_writeReg(REG_SYNCVALUE1, 0xaa); while(rfm69_readReg(REG_SYNCVALUE1) != 0xaa);
  do rfm69_writeReg(REG_SYNCVALUE1, 0x55); while(rfm69_readReg(REG_SYNCVALUE1) != 0x55);

  for(i = 0; CONFIG[i][0] != 255; i++)
    rfm69_writeReg(CONFIG[i][0], CONFIG[i][1]);

  // Encryption is persistent between resets and can trip you up during debugging.
  // Disable it during initialization so we always start from a known state.
  rfm69_encrypt(0);

  rfm69_setMode(RF69_MODE_STANDBY);

  // Is this done on function?
  while ((rfm69_readReg(REG_IRQFLAGS1) & RF_IRQFLAGS1_MODEREADY) == 0x00);

  _address = nodeID;

  return 0;  // No error
}


void rfm69_writeReg(char addr, char value) {
  char thedata[2];
  thedata[0] = addr | 0x80;
  thedata[1] = value;

  wiringPiSPIDataRW(SPI_DEVICE, thedata, 2);
  usleep(5);
}


char rfm69_readReg(char addr) {
  char thedata[2];
  thedata[0] = addr & 0x7F;
  thedata[1] = 0;

  wiringPiSPIDataRW(SPI_DEVICE, thedata, 2);
  usleep(5);

  return thedata[1];
}

void rfm69_readAllRegs(void) {
  char thedata[2];
  int i;
  thedata[1] = 0;

  for(i = 1; i <= 0x4F; i++) {
   printf("%i - %i\n\r", i, rfm69_readReg(i));
  }
}

int rfm69_readRSSI(char forceTrigger) {
  int rssi = 0;
  if (forceTrigger == 1) {
    //RSSI trigger not needed if DAGC is in continuous mode
    rfm69_writeReg(REG_RSSICONFIG, RF_RSSI_START);
    while ((rfm69_readReg(REG_RSSICONFIG) & RF_RSSI_DONE) == 0x00); // Wait for RSSI_Ready
  }
  rssi = -rfm69_readReg(REG_RSSIVALUE);
  rssi >>= 1;
  rssi += 20;
  return rssi;
}

// To enable encryption: radio.encrypt("ABCDEFGHIJKLMNOP");
// To disable encryption: radio.encrypt(null) or radio.encrypt(0)
// KEY HAS TO BE 16 bytes !!!
void rfm69_encrypt(const char* key) {
  char thedata[17];
  char i;

  rfm69_setMode(RF69_MODE_STANDBY);
  if (key!=0) {
    thedata[0] = REG_AESKEY1 | 0x80;
    for(i = 1; i < 17; i++) {
      thedata[i] = key[i-1];
    }

    wiringPiSPIDataRW(SPI_DEVICE, thedata, 17);
    usleep(5);
  }

  rfm69_writeReg(REG_PACKETCONFIG2, (rfm69_readReg(REG_PACKETCONFIG2) & 0xFE) | (key ? 1 : 0));
}

/*
 * setMode
 *
 * @param byte newMode - Could use RF69_MODE_TX, RF69_MODE_RX, RF69_MODE_SYNTH, RF69_MODE_STANDBY or RF69_MODE_SLEEP
 */
void rfm69_setMode(char newMode) {

  if (newMode == _mode) return; //TODO: can remove this?
  switch (newMode) {
    case RF69_MODE_TX:
      rfm69_writeReg(REG_OPMODE, (rfm69_readReg(REG_OPMODE) & 0xE3) | RF_OPMODE_TRANSMITTER);
      break;
    case RF69_MODE_RX:
      rfm69_writeReg(REG_OPMODE, (rfm69_readReg(REG_OPMODE) & 0xE3) | RF_OPMODE_RECEIVER);
      break;
    case RF69_MODE_SYNTH:
      rfm69_writeReg(REG_OPMODE, (rfm69_readReg(REG_OPMODE) & 0xE3) | RF_OPMODE_SYNTHESIZER);
      break;
    case RF69_MODE_STANDBY:
      rfm69_writeReg(REG_OPMODE, (rfm69_readReg(REG_OPMODE) & 0xE3) | RF_OPMODE_STANDBY);
      break;
    case RF69_MODE_SLEEP:
      rfm69_writeReg(REG_OPMODE, (rfm69_readReg(REG_OPMODE) & 0xE3) | RF_OPMODE_SLEEP);
      break;
    default: return;
  }

  // we are using packet mode, so this check is not really needed
  // but waiting for mode ready is necessary when going from sleep because the FIFO may not be immediately available from previous mode
  while (_mode == RF69_MODE_SLEEP && (rfm69_readReg(REG_IRQFLAGS1) & RF_IRQFLAGS1_MODEREADY) == 0x00); // Wait for ModeReady
  _mode = newMode;

}


// setMode(RF69_MODE_SLEEP)
void rfm69_sleep(void) {
  rfm69_setMode(RF69_MODE_SLEEP);
}


// Using this you will only receive packets matching this address
void rfm69_setAddress(char addr) {
  _address = addr;
  rfm69_writeReg(REG_NODEADRS, _address);
}


// set output power: 0=min, 31=max
// this results in a "weaker" transmitted signal, and directly results in a lower RSSI at the receiver
void rfm69_setPowerLevel(char powerLevel) {
  _powerLevel = powerLevel;
  rfm69_writeReg(REG_PALEVEL, (rfm69_readReg(REG_PALEVEL) & 0xE0) | (_powerLevel > 31 ? 31 : _powerLevel));
}


// If receiving but no signal detected -> I can send
char rfm69_canSend(void) {
  if (_mode == RF69_MODE_RX && PAYLOADLEN == 0 && rfm69_readRSSI(0) < CSMA_LIMIT) //if signal stronger than -100dBm is detected assume channel activity
  {
    rfm69_setMode(RF69_MODE_STANDBY);
    return 0; //ok
  }
  rfm69_setMode(RF69_MODE_RX);
  return 1; //nok
}

void rfm69_receive(void) {
  unsigned long timeout = 10000;
  char thedata[67];
  char i;

  DATALEN = 0;
  SENDERID = 0;
  TARGETID = 0;
  PAYLOADLEN = 0;
  ACK_REQUESTED = 0;
  ACK_RECEIVED = 0;
  RSSI = 0;
  for(i = 0; i < 63; i++) DATA[i] = 0;

  // Receive Data until timeout or valid data
  while(1) {
    if (rfm69_readReg(REG_IRQFLAGS2) & RF_IRQFLAGS2_PAYLOADREADY)
      rfm69_writeReg(REG_PACKETCONFIG2, (rfm69_readReg(REG_PACKETCONFIG2) & 0xFB) | RF_PACKET2_RXRESTART); // avoid RX deadlocks
    ////writeReg(REG_DIOMAPPING1, RF_DIOMAPPING1_DIO0_01); //set DIO0 to "PAYLOADREADY" in receive mode
    rfm69_setMode(RF69_MODE_RX);

    //printf("Ya estoy en modo RX\n\r");

    // Receive Data until timeout (aprox 2s)
    while((rfm69_readReg(REG_IRQFLAGS2) & RF_IRQFLAGS2_PAYLOADREADY) == 0) {
      timeout--;
      if(timeout == 0) {
        //printf("Timeout!\n\r");
        rfm69_setMode(RF69_MODE_STANDBY);
        return;
      }
      //usleep(1);
    }

    //printf("He recibido algo!!\n\r");

    // Received any packet!
    rfm69_setMode(RF69_MODE_STANDBY);
    thedata[0] = REG_FIFO & 0x7f;
    thedata[1] = 0; // PAYLOADLEN
    thedata[2] = 0; // TARGETID

    wiringPiSPIDataRW(SPI_DEVICE, thedata, 3);
    usleep(5);

    PAYLOADLEN = thedata[1];
    PAYLOADLEN = PAYLOADLEN > 66 ? 66 : PAYLOADLEN;
    TARGETID = thedata[2];

    //printf("Payload length: %i\n\r", PAYLOADLEN);
    //printf("Target id: %i\n\r", TARGETID);

    if(!(_promiscuousMode || TARGETID==_address || TARGETID==RF69_BROADCAST_ADDR)) {//match this node's address, or $
       PAYLOADLEN = 0;
     } else {
       DATALEN = PAYLOADLEN - 3;

       thedata[0] = REG_FIFO & 0x7f;
       thedata[1] = 0; // SENDERID
       thedata[2] = 0; // CTLbyte
       for(i = 0; i < DATALEN; i++) {
         thedata[i+3] = 0; // DATA
       }

       wiringPiSPIDataRW(SPI_DEVICE, thedata, DATALEN + 3);

       SENDERID = thedata[1];
       CTLBYTE = thedata[2];

       //printf("Sender id: %i\n\r", thedata[1]);
       //printf("CTLbyte: %i\n\r", thedata[2]);
       //printf("Data: ...\n\r");
       for(i = 0; i < DATALEN; i++) {
         //printf("%c\n\r", thedata[i+3]);
         DATA[i] = thedata[i+3];
       }

       RSSI = rfm69_readRSSI(0);
       return;

    }
  }
}

char rfm69_getDataLen(void) {
  return DATALEN;
}

char rfm69_getTargetId(void) {
  return TARGETID;
}

void rfm69_getData(char *data) {
  char i;
  for(i = 0; i < 63; i++) {
    data[i] = DATA[i];
  }
}

int rfm69_getRssi(void) {
  return RSSI;
}

char rfm69_getSenderId(void) {
  return SENDERID;
}

/* Send a packet
 *
 * @param byte toAddress - Address to send the packet
 * @param const void* buffer - Pointer to a buffer to be sent
 * @param byte bufferSize - Number of bytes to be sent
 * @param boolean requestACK - If an ACK is needed to ensure transmission
 */
void rfm69_send(char toAddress, const void* buffer, char bufferSize, char requestACK) {
  rfm69_writeReg(REG_PACKETCONFIG2, (rfm69_readReg(REG_PACKETCONFIG2) & 0xFB) | RF_PACKET2_RXRESTART); // avoid RX deadlocks
  // Avoiding sending when another node is sending now
  //printf("I will check if I can send\n\r");
  // I don't know why this function doesn't work
  //while(rfm69_canSend() != 0);
  rfm69_sendFrame(toAddress, buffer, bufferSize, requestACK, 0x00);
}

void rfm69_sendFrame(char toAddress, const void* buffer, char bufferSize, char requestACK, char sendACK) {
  char thedata[63];
  char i;

  //printf("Prepared to send a new frame\n\r");

  rfm69_setMode(RF69_MODE_STANDBY); //turn off receiver to prevent reception while filling fifo
  while ((rfm69_readReg(REG_IRQFLAGS1) & RF_IRQFLAGS1_MODEREADY) == 0x00); // Wait for ModeReady
  ////writeReg(REG_DIOMAPPING1, RF_DIOMAPPING1_DIO0_00); // DIO0 is "Packet Sent"
  if (bufferSize > MAX_DATA_LEN) bufferSize = MAX_DATA_LEN;

  //printf("Preparing the packet\n\r");

  for(i = 0; i < 63; i++) thedata[i] = 0;

  thedata[0] = REG_FIFO | 0x80;
  thedata[1] = bufferSize + 3;
  thedata[2] = toAddress;
  thedata[3] = _address;
  if(sendACK == 1) thedata[4] = 0x80;
  else if(requestACK == 1) thedata[4] = 0x40;
  else thedata[4] = 0x00;
  for(i = 0; i < bufferSize; i++) {
    thedata[i + 5] = ((char*)buffer)[i];
  }

  //printf("Sending by SPI\n\r");

  wiringPiSPIDataRW(SPI_DEVICE, thedata, bufferSize + 5);

  /* no need to wait for transmit mode to be ready since its handled by the radio */
  rfm69_setMode(RF69_MODE_TX);
  ////while (digitalRead(_interruptPin) == 0); //wait for DIO0 to turn HIGH signalling transmission finish
  ////delay(10);
  //printf("Changing to TX mode\n\r");
  while (!(rfm69_readReg(REG_IRQFLAGS2) & RF_IRQFLAGS2_PACKETSENT)); // Wait for ModeReady
  rfm69_setMode(RF69_MODE_STANDBY);
  //printf("Done, Changing to standby mode\n\r");
}
