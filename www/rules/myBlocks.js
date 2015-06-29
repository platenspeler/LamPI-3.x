//
// This file contains the definitions for customer Blocks
//

// --------------------------------------------------------------------
// SUPPORTING FUNCTIONS
// --------------------------------------------------------------------
function lookupSensorByName(name) {
	for (var i=0; i<sensors.length; i++) {
		if (sensors[i]['name']==name) return(i);
	}
	return(false);
}

function lookupDeviceByName(name) {
	for (var i=0; i<devices.length; i++) {
		if (devices[i]['name']==name) return(i);
	}
	return(false);
}

// Text Length
Blockly.Blocks['text_length'] = {
  init: function() {
    this.setHelpUrl('http://www.w3schools.com/jsref/jsref_length_string.asp');
    this.setColour(160);
    this.appendValueInput('VALUE')
        .setCheck('String')
        .appendField('length of');
    this.setOutput(true, 'Number');
    this.setTooltip('Returns number of letters in the provided text.');
  }
};

// ----------------------------------------------------------------------------
// CONTROLS
// ----------------------------------------------------------------------------

// 1
Blockly.Blocks['controls_when'] = {
  init: function() {
    this.setHelpUrl('http://www.example.com/');
    this.setColour(285);
    this.appendStatementInput("statement_when")
        .setCheck("null")
        .appendField("freq")
        .appendField(new Blockly.FieldDropdown([["Only Once", "ONCE"], ["Every Day", "DAY"], ["Any Time", "ANY"]]), "NAME");
    this.setInputsInline(true);
    this.setTooltip('');
  }
};

Blockly.JavaScript['controls_when'] = function(block) {
  var statements_statement_when = Blockly.JavaScript.statementToCode(block, 'statement_when');
  var dropdown_name = block.getFieldValue('NAME');
  // TODO: Assemble JavaScript into code variable.
  var code = '...';
  return code;
};


// ----------------------------------------------------------------------------
// SENSORS
// ----------------------------------------------------------------------------

// ------------------------------------------------------------
// 1. value (screen side works)
Blockly.Blocks['sensors_temperature'] = {
  init: function() {
    this.setHelpUrl('http://www.example.com/');
    this.setColour(330);
	var str = [];
	for (var i=0; i<sensors.length;i++) {
		str.push( [ sensors[i]['name'], sensors[i]['name']+"" ] );
	}
    this.appendDummyInput()
        //.setCheck("String")			// Only if type is not appendDummyInput
		.appendField('temp')			// Make null if type is any
		.appendField(new Blockly.FieldDropdown( str ), "drop");
    this.setOutput(true, "Number");
    this.setTooltip('Returns the sensor temperature value');
  }
};

//
Blockly.JavaScript['sensors_temperature'] = function(block) {
  console.log("start code for sensor_temperature")
  var statements_temp = Blockly.JavaScript.statementToCode(block, 'temp');
  var dropdown_drop = block.getFieldValue('drop');
  // TODO: Assemble JavaScript into code variable.
  console.log("dropdown: <"+dropdown_drop+">");
  var code = '';
  var i = lookupSensorByName(dropdown_drop);
  if (i>=0) {
	 code="config['sensors']["+i+"]['sensor']['temperature']['val']"; 
  }
  // console.log("statements_temp: <"+statements_temp+"> ");
  // TODO: Change ORDER_NONE to the correct strength.
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

// ------------------------------------------------------------
// 2. humidity value (screen side works)
Blockly.Blocks['sensors_humidity'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(320);
	var str = [];
	for (var i=0; i<sensors.length;i++) {
		if (sensors[i]['sensor'].hasOwnProperty('humidity'))
			str.push( [ sensors[i]['name'], sensors[i]['name']+"" ] );
	}
    this.appendDummyInput()
        //.setCheck("String")			// Only if type is not appendDummyInput
		.appendField('humi')			// Make null if type is any
		.appendField(new Blockly.FieldDropdown( str ), "drop2");
    this.setOutput(true, "Number");
    this.setTooltip('Returns the sensor humidity value');
  }
};

//
Blockly.JavaScript['sensors_humidity'] = function(block) {
  var statements_humi = Blockly.JavaScript.statementToCode(block, 'humi');
  var dropdown_drop2 = block.getFieldValue('drop2');
  // TODO: Assemble JavaScript into code variable.
  var code = '';
  var i = lookupSensorByName(dropdown_drop2);
  if (i>=0) {
	 code="config['sensors']["+i+"]['sensor']['humidity']['val']"; 
  }
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

// ----------------------------------------------------------------------------
// DEVICES
// ----------------------------------------------------------------------------

// ------------------------------------------------------------
// 1. Switches
Blockly.Blocks['devices_switch'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(270);
	var str = [];
	for (var i=0; i<devices.length;i++) {
		if (devices[i].type == "switch")
			str.push( [ devices[i]['name'], devices[i]['name']+"" ] );
	}
    this.appendDummyInput()
        //.setCheck("String")			// Only if type is not appendDummyInput
		.appendField('switch')			// Make null if type is any
		.appendField(new Blockly.FieldDropdown( str ), "switch_1");
    this.setOutput(true, "Number");
    this.setTooltip('Sets switch value');
  }
};

//
Blockly.JavaScript['devices_switch'] = function(block) {
  var statements_switch = Blockly.JavaScript.statementToCode(block, 'switch');
  var dropdown_switch_1 = block.getFieldValue('switch_1');
  // TODO: Assemble JavaScript into code variable.
  var code = '';
  console.log("dropdown: <"+dropdown_switch_1+">");
  console.log("statements_sens: <"+statements_switch+"> ");

  var i = lookupDeviceByName(dropdown_switch_1);
  if (i>=0) {
	 code="confif['devices']["+i+"]['val']"; 
  }
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

// ------------------------------------------------------------
// 3.
Blockly.Blocks['devices_set'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(280);
	var str = [];
	for (var i=0; i<devices.length;i++) {
		str.push( [ devices[i]['name'], devices[i]['name']+"" ] );
	}
    this.appendValueInput("dev_set")
        .setCheck("String")			// Only if type is not appendDummyInput
		.appendField("set: ")
		.appendField(new Blockly.FieldDropdown( str ), "set_1")
	this.setPreviousStatement(true, "String");
    this.setNextStatement(true, "String");
//    this.setOutput(true, "String");
    this.setTooltip('Set device value');
  }
};

Blockly.JavaScript['devices_set'] = function(block) {
	var dropdown_set_1 = block.getFieldValue('set_1');
	var value_dev_set = Blockly.JavaScript.valueToCode(block, 'dev_set', Blockly.JavaScript.ORDER_ATOMIC);
	var code = '';
	var i = lookupDeviceByName(dropdown_set_1);
	if (i>=0) {
		//code="config['devices']["+i+"]['val']="+value_dev_set; 
		code="queueDevice( "+i+", "+value_dev_set+", '00:00:00', 0, 1); ";
	}
	return code;
};

// ----------------------------------------------------------------------------
// TIMES
// ----------------------------------------------------------------------------

// ------------------------------------------------------------
// 1. Time Now
Blockly.Blocks['times_now'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(20);
    this.appendDummyInput()
		.appendField('time');			// Make null if type is any
	this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setTooltip('Current Time');
  }
};

//
Blockly.JavaScript['times_now'] = function(block) {
  var code = '';
  code = 'getTicks() '
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

// ------------------------------------------------------------
// 2. Sunrise
Blockly.Blocks['times_sunrise'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(20);
    this.appendDummyInput()
		.appendField('sunrise');			// Make null if type is any
    this.setOutput(true, "Number");
    this.setTooltip('Sets switch value');
  }
};

//
Blockly.JavaScript['times_sunrise'] = function(block) {
  code = 'getSunRise() ';
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};


// ------------------------------------------------------------
// 3. Sunset
Blockly.Blocks['times_sunset'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(20);
	var str = [];
	for (var i=0; i<devices.length;i++) {
		if (devices[i].type == "switch")
			str.push( [ devices[i]['name'], devices[i]['name']+"" ] );
	}
    this.appendDummyInput()
		.appendField('sunset');			// Make null if type is any
    this.setOutput(true, "Number");
    this.setTooltip('Sets switch value');
  }
};

//
Blockly.JavaScript['times_sunset'] = function(block) {
  // TODO: Assemble JavaScript into code variable.
  var code = 'getSunSet() ';
  return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

// ------------------------------------------------------------
// 4. Offset
Blockly.Blocks['times_offset'] = {
  init: function() {
    this.setHelpUrl('http://www.example.com/');
    this.setColour(20);
    this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput("hh"), "h_adj")
        .appendField(":")
        .appendField(new Blockly.FieldTextInput("mm"), "m_adj")
        .appendField(":")
        .appendField(new Blockly.FieldTextInput("ss"), "s_adj");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setTooltip('');
  }
};

Blockly.JavaScript['times_offset'] = function(block) {
  var text_h_adj = block.getFieldValue('h_adj');
  var text_m_adj = block.getFieldValue('m_adj');
  var text_s_adj = block.getFieldValue('s_adj');
  // TODO: Assemble JavaScript into code variable.
  var code = ' ('+text_h_adj+'*3600+ '+text_m_adj+'*60 + '+text_s_adj+') ';
  return [code, Blockly.JavaScript.ORDER_NONE];
};



// ----------------------------------------------------------------------------
// TEXT
// ----------------------------------------------------------------------------

// ------------------------------------------------------------
// 1.
Blockly.Blocks['text_console'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(80);
	var str = [];
    this.appendValueInput("console")
        .setCheck( [ "String", "Number" ])			// Only if type is not appendDummyInput
		.appendField("console: ");
	this.setPreviousStatement(true);
	this.setNextStatement(true);
//	this.setOutput(true, "String");
    this.setTooltip('Send to Console');
  }
};


Blockly.JavaScript['text_console'] = function(block) {
  // Print statement on console.
	var value_console = Blockly.JavaScript.valueToCode(block, 'console', Blockly.JavaScript.ORDER_NONE) || '\'\'';
	var value_input   = Blockly.JavaScript.statementToCode(block, 'do');
	var code = value_input+'console.log('+value_console+'); '
	return code;
};

// 1.
Blockly.Blocks['text_alert'] = {
  init: function() {
    this.setHelpUrl('http://www.westenberg.org/');
    this.setColour(80);
	var str = [];
    this.appendValueInput("console")
        .setCheck( [ "String", "Number" ])			// Only if type is not appendDummyInput
		.appendField("alert: ");
	this.setPreviousStatement(true);
	this.setNextStatement(true);
//	this.setOutput(true, "String");
    this.setTooltip('Send to Alert');
  }
};

Blockly.JavaScript['text_alert'] = function(block) {
  // Print statement on console.
	var value_console = Blockly.JavaScript.valueToCode(block, 'console', Blockly.JavaScript.ORDER_NONE) || '\'\'';
	var value_input   = Blockly.JavaScript.statementToCode(block, 'do');
	var code = 'msg = { tcnt:1, type:"raw", action:"alert", message:" '+value_console+' " }; broadcast(JSON.stringify(msg), null); ';
	
	return code;
};
