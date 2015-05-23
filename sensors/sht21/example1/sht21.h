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
// Filename:    
// Description: 
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
// History:     01.01.2011 Initial version
//--------------------------------------------------------------------------------------------------

#ifndef SHT21_H
#define SHT21_H

//=== Includes =====================================================================================	

#include "std_c.h"

//=== Preprocessing directives (#define) ===========================================================

#define	ERROR_SHT21_I2C				1
#define	ERROR_SHT21_CRC_TEMP		2
#define	ERROR_SHT21_CRC_HUMIDITY	4

//=== Type definitions (typedef) ===================================================================

//=== Global constants (extern) ====================================================================

//=== Global variables (extern) ====================================================================

uint8	Sht21Error;

//=== Global function prototypes ===================================================================

uint8 SHT21_Read(int16 *temp,uint8 *humidity);
void PrintSht21Error(void);

#endif
