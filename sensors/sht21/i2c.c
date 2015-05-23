//--------------------------------------------------------------------------------------------------
//                                  _            _     
//                                 | |          | |    
//      ___ _ __ ___  ___ _   _ ___| |_ ___  ___| |__  
//     / _ \ '_ ` _ \/ __| | | / __| __/ _ \/ __| '_ \. 
//    |  __/ | | | | \__ \ |_| \__ \ ||  __/ (__| | | |
//     \___|_| |_| |_|___/\__, |___/\__\___|\___|_| |_|
//                         __/ |                       
//                        |___/    Engineering (www.emsystech.de)
//
// Filename:   	i2c.c 
// Description: Functions for interfaceing I2C on Raspberry Pi
//
// Open Source Licensing 
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
// Dieses Programm ist Freie Software: Sie können es unter den Bedingungen
// der GNU General Public License, wie von der Free Software Foundation,
// Version 3 der Lizenz oder (nach Ihrer Option) jeder späteren
// veröffentlichten Version, weiterverbreiten und/oder modifizieren.
//
// Dieses Programm wird in der Hoffnung, dass es nützlich sein wird, aber
// OHNE JEDE GEWÄHRLEISTUNG, bereitgestellt; sogar ohne die implizite
// Gewährleistung der MARKTFÄHIGKEIT oder EIGNUNG FÜR EINEN BESTIMMTEN ZWECK.
// Siehe die GNU General Public License für weitere Details.
//
// Sie sollten eine Kopie der GNU General Public License zusammen mit diesem
// Programm erhalten haben. Wenn nicht, siehe <http://www.gnu.org/licenses/>.
//
// Author:      Martin Steppuhn
// History:     19.11.2012 Initial version
//--------------------------------------------------------------------------------------------------

//=== Includes =====================================================================================

#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <stdio.h>

#include "std_c.h"
#include "i2c.h"

//=== Preprocessing directives (#define) ===========================================================

//=== Type definitions (typedef) ===================================================================

//=== Global constants =============================================================================

//=== Global variables =============================================================================

uint8	I2cError;

//=== Local constants  =============================================================================

//=== Local variables ==============================================================================

int		I2cDevHandle;

//=== Local function prototypes ====================================================================

//--------------------------------------------------------------------------------------------------
// Name:	  I2C_Open 
// Function:  Open device/port
//			  Raspberry Hardwarerevision 1.0	P1 = /dev/i2c-0
//			  Raspberry Hardwarerevision 2.0	P1 = /dev/i2c-1
//            
// Parameter: Devicename (String)
// Return:    
//--------------------------------------------------------------------------------------------------
void I2C_Open(char *dev)
{
	I2cError = 0;

	if ((I2cDevHandle = open(dev, O_RDWR)) < 0)  I2cError |= ERROR_I2C_OPEN;
}	

//--------------------------------------------------------------------------------------------------
// Name:      I2C_Close
// Function:  Close port/device
//            
// Parameter: -
// Return:    -
//--------------------------------------------------------------------------------------------------
void I2C_Close(void)
{
	close(I2cDevHandle);
}	

//--------------------------------------------------------------------------------------------------
// Name:      I2C_Setup
// Function:  Setup port for communication
//            
// Parameter: mode (typical "I2C_SLAVE"), Device address (typical slave address from device) 
// Return:    -
//--------------------------------------------------------------------------------------------------
void I2C_Setup(uint32 mode,uint8 addr)	
{	
	if(!I2cError)
	{
		if (ioctl(I2cDevHandle, mode,addr) < 0) I2cError |= ERROR_I2C_SETUP;	
					
	}						
}	

//--------------------------------------------------------------------------------------------------
// Name:      I2C_Write1
// Function:  Write a singel byte to I2C-Bus
//            
// Parameter: Byte to send
// Return:    -
//--------------------------------------------------------------------------------------------------
void I2C_Write1(uint8 d)
{
	if(!I2cError)
	{
		if((write(I2cDevHandle, &d, 1)) != 1) 	I2cError |= ERROR_I2C_WRITE;	
	}
}

//--------------------------------------------------------------------------------------------------
// Name:      I2C_Write2
// Function:  Write two bytes to I2C
//            
// Parameter: First byte, second byte
// Return:    -
//--------------------------------------------------------------------------------------------------
void I2C_Write2(uint8 d0,uint8 d1)
{
	uint8 buf[2];
	
	if(!I2cError)
	{
		buf[0]=d0;
		buf[1]=d1;
		if ((write(I2cDevHandle, buf,2)) != 2) I2cError |= ERROR_I2C_WRITE;		
	}
}

//--------------------------------------------------------------------------------------------------
// Name:      I2C_Read
// Function:  Read a number of bytes
//            
// Parameter: Pointer to buffer, Number of bytes to read
// Return:    -
//--------------------------------------------------------------------------------------------------
void I2C_Read(uint8 *data,uint8 length)
{
	if(!I2cError)
	{
		if (read(I2cDevHandle, data,length) != length) I2cError |= ERROR_I2C_READ;		
	}
}

//--------------------------------------------------------------------------------------------------
// Name:      I2C_PrintError
// Function:  Print error flags as readable text.
//            
// Parameter: -
// Return:    -
//--------------------------------------------------------------------------------------------------
void I2C_PrintError(void)
{	
	if(I2cError & ERROR_I2C_OPEN)	printf("Failed to open I2C-Port\r\n");
	if(I2cError & ERROR_I2C_SETUP)	printf("Failed to setup I2C-Port\r\n");
	if(I2cError & ERROR_I2C_READ)	printf("I2C read error\r\n");
	if(I2cError & ERROR_I2C_WRITE)	printf("I2C write error\r\n");
}
