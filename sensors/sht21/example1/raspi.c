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
// Filename:    raspi.c
// Description: Functions for Raspberry Pi
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

#include "std_c.h"
#include "raspi.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

//=== Preprocessing directives (#define) ===========================================================

//=== Type definitions (typedef) ===================================================================

//=== Global constants =============================================================================

//=== Global variables =============================================================================

//=== Local constants  =============================================================================

//=== Local variables ==============================================================================

//=== Local function prototypes ====================================================================


//--------------------------------------------------------------------------------------------------
// Name:        GetRaspberryHwRevision
// Function:  	Check wich Hardware is used:
//				http://www.raspberrypi.org/archives/1929
//	
//				Model B Revision 1.0 									2
//				Model B Revision 1.0 + ECN0001 (no fuses, D14 removed) 	3
//				Model B Revision 2.0 									4, 5, 6
//            
// Parameter: 	-
// Return:      0=no info , 1=HW Rev.1, 2=HW Rev.2
//--------------------------------------------------------------------------------------------------
int GetRaspberryHwRevision(void)
{	
	FILE *fp;
	char line[32];
	char s[32];
	int i;
	
	fp = fopen("/proc/cpuinfo", "r");		// open as file
	if(fp != NULL)
	{	
		while(fgets(line,32,fp))			// get line
		{
			sscanf(line,"%s : %x",(char*)&s,&i);	// parse for key and value
			//printf("[%s] [%i]\r\n",s,i);
			if(strcmp(s,"Revision") == 0)		// check for "Revision"
			{			
				//printf("Found: %s=%i\r\n",s,i);
				if(i < 4)  return 1;
				else		return 2;
			}
		}
	}
	else
	{
		//printf("cpuinfo not available.\r\n"); 
		return 0;
	}
	//printf("no revision info available.\r\n"); 
	return 0;
}


/*int GetRaspberryHwRevision(void)
{	
	FILE *fp;
	char line[64];
	char s1[64];
	char s2[64];
	int i;
	
	fp = fopen("/proc/cpuinfo", "r");		// open as file
	if(fp != NULL)
	{	
		while(fgets(line,64,fp))			// get line
		{  
			sscanf(line,"%s %s : %i",(char*)&s1,(char*)&s2,&i);		// parse for key and value
			if((strcmp(s1,"CPU") == 0)	&&  (strcmp(s2,"revision") == 0))			// check for "CPU revision"
			{			
				//printf("Found: %s=%i\r\n",s2,i);
				if(i < 4)  return 1;
					else	return 2;
			}
		}
	}
	else
	{
		//printf("cpuinfo not available.\r\n"); 
		return 0;
	}
	//printf("no revision info available.\r\n"); 
	return 0;
}*/

//--------------------------------------------------------------------------------------------------
// Name:      DelayMs and DelayUs
// Function:  Delay for Milliscond or Microseconds
//            
// Parameter: Time
// Return:    -
//--------------------------------------------------------------------------------------------------
void DelayMs(uint32 ms)
{
  struct timespec t, dummy ;

  t.tv_sec  = (time_t)(ms / 1000) ;
  t.tv_nsec = (long)(ms % 1000) * 1000000 ;
  nanosleep (&t, &dummy);
}

void DelayUs(uint32 us)
{
  struct timespec t, dummy ;

  t.tv_sec  = 0 ;
  t.tv_nsec = (long)(us * 1000) ;
  nanosleep (&t, &dummy);
}

