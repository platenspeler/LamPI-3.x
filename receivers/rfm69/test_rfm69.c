#include "rfm69.h"
#include <wiringPi.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>
#include <pthread.h>
#include <errno.h>

#define FREQUENCY RF69_433MHZ
#define NODEID 1
#define NETWORKID 100
#define TXPOWER 31
// A 16 bit password
#define CRYPTPASS "0123456789012345"

char received[63];
int rssi;
char datalen;
char senderId;

static void uso(void) {
  fprintf(stderr, "Use:\n Simply use it without args :D");
  exit(1);
}

int main(int argc, char* argv[]) {
  //if (argc != 2) uso();
  int i;

  rfm69_initialize(FREQUENCY, NODEID, NETWORKID);

  //rfm69_readAllRegs();
  //printf("RSSI: %i", rfm69_readRSSI(0));

  rfm69_encrypt(CRYPTPASS);
  rfm69_setPowerLevel(TXPOWER); // Max Power


  while(1) {
    rfm69_receive();
    datalen = rfm69_getDataLen();
    if(datalen > 0) {
      rssi = rfm69_getRssi();
      rfm69_getData(received);
      senderId = rfm69_getSenderId();

      char packet[8] = {0, 1, 2, 3, 4, 5, 6, 7};

      rfm69_send(senderId, (const void*) packet, 8, 0);

      printf("New packet received! ---------------\n\r");
      printf("From: %i\n\r", senderId);
      printf("Length: %i\n\r", datalen);
      printf("RSSI: %i\n\r", rssi);
      printf("Data: \n\r");
      for(i = 0; i < datalen; i++) {
        printf("%c", received[i]);
      }
      printf("\n\r------------------------------------\n\r");

      printf("A response has been sent\n\r");
    }
  }

}
