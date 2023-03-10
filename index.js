// Copyright (c)2021 Quinn Michaels
// Distributed under the MIT software license, see the accompanying
// file LICENSE.md or http://www.opensource.org/licenses/mit-license.php.
const {EventEmitter} = require('events');
class Deva {
  constructor(opts) {
    opts = opts || {};
    this._uid = this.uid();                             // the unique id assigned to the agent at load
    this.state = 'offline';                             // current state of agent.
    this.active = false;                                // the active/birth date.
    this.security = false;                              // inherited Security features.
    this.config = opts.config || {};                    // local Config Object
    this.events = opts.events || new EventEmitter({});  // Event Bus
    this.lib = opts.lib || {};                          // used for loading library functions
    this.agent = opts.agent || false;                   // Agent profile object
    this.client = opts.client || false;                 // Client profile object
    this.devas = opts.devas || {};                      // Devas which are loaded
    this.vars = opts.vars || {};                        // Variables object
    this.listeners = opts.listeners || {};              // local Listeners
    this.modules = opts.modules || {};                  // 3rd Party Modules
    this.func = opts.func || {};                        // local Functions
    this.methods = opts.methods || {};                  // local Methods
    this.maxListeners = opts.maxListenners || 0;        // set the local maxListeners

    for (var opt in opts) {
      if (!this[opt]) this[opt] = opts[opt];            // set any remaining opts to this.
    }

    this.cmdChr = '!';
    this.askChr = '#';
    this.inherit = ["events", "config", "lib", "security", "client"];
    this.bind = ["listeners", "methods", "func", "lib", "security", "agent", "client"];
    this.states = {
      offline: 'OFFLINE',
      init: 'INITIALIZE',
      start: 'START',
      stop: 'STOP',
      enter: 'ENTER',
      exit: 'EXIT',
      done: 'DONE',
      wait: 'WAITING',
      ask: 'ASK',
      question: 'QUESTION',
      answer: 'ANSWER',
      error: 'ERROR',
      security: 'SECURITY',
      medic: 'MEDICAL',
    };
    this.messages = {
      offline: 'AGENT OFFLINE',
      loaded: 'DEVAS LOADED',
      stopped: 'DEVAS STOPPED',
      notext: 'NO TEXT',
    }
  }

  // set the state of the agent with the passed value to match the valid keys.
  // this will also talk a global state event with the agent data and state.
  // then security can watch all the glorious state change events.
  set _state(st) {
    this.state = this.states[st];
    this.talk(`state`,{
      uid: this.uid(),
      agent: this.agent,
      state: this.state,
      created: Date.now(),
    });
    this.prompt(this.state);
  }
  // Called from the init function to bind the elements defined in the this.bind variable.
  // the assign bind ensures that the *this* scope is available to child elements/functions.
  _assignBind() {
    return new Promise((resolve, reject) => {
      try {
        this.bind.forEach(bind => {
          if (this[bind]) for (let x in this[bind]) {
            if (typeof this[bind][x] === 'function') {
              this[bind][x] = this[bind][x].bind(this);
            }
          }
        });
        // bind translate
        const translate = this.agent && this.agent.translate && typeof this.agent.translate === 'function';
        if (translate) this.agent.translate = this.agent.translate.bind(this);
        // bind parser
        const parse = this.agent && this.agent.parse && typeof this.agent.parse === 'function';
        if (parse) this.agent.parse = this.agent.parse.bind(this);
      }
      catch (e) {
        return reject(e);
      }
      finally {
        return resolve();
      }
    });
  }

  // Called from the init function to assign the listeners to various states.
  // when the listener fires it will call the associated named function.
  _assignListeners() {
    return new Promise((resolve, reject) => {
      try {
        // set the default listeners for the states of the agent.
        for (let state in this.states) {
          this.events.on(`${this.agent.key}:${state}`, packet => {
            return this[state](packet);
          })
        }
        // set the assigned listeners for the agent.
        for (let listener in this.listeners) {
          this.events.on(listener, packet => {
            return this.listeners[listener](packet);
          })
        }
      }
      catch (e) {
        return reject(e);
      }
      finally {
        return resolve();
      }
    });
  }

  // Some elements will inherit the data of the parent. this object will loop over
  // any children data that theis deva has and assign the inherited information.
  _assignInherit() {
    return new Promise((resolve, reject) => {
      try {
        for (let d in this.devas) {
          this.inherit.forEach(inherit => {
            this.devas[d][inherit] = this[inherit];
          });
        }
      }
      catch (e) {
        return reject(e);
      }
      finally {
        return resolve();
      }
    });
  }

  // General handler for when a method is NOT found from a user command.
  _methodNotFound(packet) {
    packet.a = {
      agent: this.agent || false,
      client: this.client || false,
      text: `${packet.q.meta.method} is NOT a valid method.`,
      meta: {
        key: this.agent.key,
        method: packet.q.meta.method,
      },
      created: Date.now(),
    };
    return packet;
  }

  // A simple interface to generate a unique id for the agent. As agents will
  // quite oftne have to key their transactions. This will provide all agents
  // with the same key generator which can also be modified to link into a remote
  // generator or some other solution if needed.
  uid() {
    const min = Math.floor(Date.now() - (Date.now() / Math.PI));
    const max = Math.floor(Date.now() + (Date.now() * Math.PI));
    return Math.floor(Math.random() * (max - min)) + min;
  }

  // The talk interface binds to the events emitter to allow agents to perform a
  // this.talk(*) feature.
  talk(evt, resource=false) {
    return this.events.emit(evt, resource);
  }

  // the listen interface binds to the event emitter to allow agents to listen
  // this.listen(*) feature.
  listen(evt, callback) {
    return this.events.on(evt, callback);
  }

  // Instances where listening for only one unique keyed event is required
  // this interface is provided for the this.once(*) feature.
  once(evt, callback) {
    return this.events.once(evt, callback);
  }

  // where an agent needs to ignore events or remove a lisatener this interface
  // serves the this.ignore(*) feature.
  ignore(evt, callback) {
    return this.events.removeListener(evt, callback);
  }

  // Used when loading a Deva dynamically into the current set.
  load(opts) {
    this.devas[opts.key] = opts;
    // inherit the data to the new deva.
    this.inherit.forEach(inherit => {
      this.devas[agent][inherit] = this[inherit];
    });

    return Promise.resolve();
  }

  // Used when unloading a deva dynamically from the set.
  unload(agent) {
    delete this.devas[agent];
    return Promise.resolve();
  }

  // Askign a question to another deva in the set besides itself. If the question
  // interface detects the action is to ask another deva a question with
  // this.askChr variable match. Then an answer packet is generated and the
  // deva is asked to process the question asked and return it's proper data set
  // from the requested method.
  // this is an event function that relies on talk/listen

  ask(packet) {
    if (!this.active) return Promise.resolve(this.messages.offline);

    this._state = this.states.ask;
    packet.a = {
      agent: this.agent || false,
      client: this.client || false,
      meta: {
        key: this.agent.key,
        method: packet.q.meta.method,
        params: packet.q.meta.params,
      },
      text: false,
      html: false,
      data: false,
      created: Date.now(),
    };

    try {
      if (this.methods[packet.q.meta.method] === undefined) {
        return setImmediate(() => {
          packet.a.text = `INVALID METHOD (${packet.q.meta.method})`;
          this.talk(`${this.agent.key}:ask:${packet.id}`, packet);
        });
      }

      // The method is parsed and depending on what method is asked for it returns
      // the response based on the passed through packet.
      this.methods[packet.q.meta.method](packet).then(result => {
        if (typeof result === 'object') {
          packet.a.text = result.text || false;
          packet.a.html = result.html || false;
          packet.a.data = result.data || false;
        }
        else {
          packet.a.text = result;
        }
        // talk back to the once event with the ask key.
        this.talk(`${this.agent.key}:ask:${packet.id}`, packet);
      }).catch(err => {
        this._state = this.states.error;
        // If the ask method fails then a reject error is returned from the this.error
        // interface.
        this.talk(`${this.agent.key}:ask:${packet.id}`, {error:err.toString()});
        return this.error(err, packet);
      })
    }
    catch (e) {
      this._state = this.states.error;
      // if any error is caught in the processing of the ask then it returns and
      // executes the this.error(*) interface.
      this.talk(`${this.agent.key}:ask:${packet.id}`, {error:e.toString()});
      return this.error(e, packet)
    }
    // now when we ask the meta params[0] should be the method
  }

  // general question interface.
  // accepts two arguments a *TEXT* and *DATA* object.
  // if the question being asked is a simple text command then
  // this.question('#*agent.key *method* *text*')
  // if the question is a data object
  // this.question('#*agent.key* *method* *properties*', {*data*});
  question(TEXT=false, DATA=false) {
    this._state = this.states.question;
    const id = this.uid();
    const t_split = TEXT.split(' ');
    const isAsk = t_split[0].startsWith(this.askChr) ? t_split[0].substring(1) : false;
    const isCmd = t_split[0].startsWith(this.cmdChr) ? t_split[0].substring(1) : false;
    // Format the packet for return on the request.
    const orig = TEXT;
    const data = DATA;
    const packet = {
      id,
      q: {},
      a: {},
      created: Date.now(),
    };

    let text = TEXT,
        params = false,
        method = 'question',
        key = this.agent.key;

    return new Promise((resolve, reject) => {
      if (!TEXT) return reject(this.messages.notext);
      try {
        if (!this.active) return reject(this.messages.offline);

        // *: send just a string of text
        // !: send a command to the local agent
        // #: ask another agent a question
        // #agent method:param1:param2 with text strings for proccessing
        // !method param:list:parse for the local agent
        // if is an ask then we format one way
        if (isAsk) {
          params = t_split[1] ? t_split[1].split(':') : false;
          method = params[0];
          text = t_split.slice(2).join(' ').trim();
          key = isAsk;
        }
        else if (isCmd) {
          params = t_split[1] ? t_split[1].split(':') : false;
          method = isCmd;
          text = t_split.slice(1).join(' ').trim()
        }

        packet.q = {
            agent: this.agent || false,
            client: this.client || false,
            meta: {
              key,
              orig,
              method,
              params,
            },
            text,
            data,
            created: Date.now(),
        }

        // if is a command then we format another way
        // if the user asks a question to another deva '#' then issue the talk/once
        // event combination.
        if (isAsk) {
          this._state = this.states.ask;
          this.talk(`${isAsk}:ask`, packet);
          this.once(`${isAsk}:ask:${packet.id}`, answer => {
            return resolve(answer);
          });
        }
        // if the user sends a local command '$' then it will ask of the self.
        else {
          if (typeof this.methods[method] !== 'function') return resolve(this._methodNotFound(packet));
          this.methods[method](packet).then(result => {
            const text = typeof result === 'object' ? result.text : result;
            const html = typeof result === 'object' ? result.html : result;
            const data = typeof result === 'object' ? result.data : false;
            packet.a = {
              agent: this.agent || false,
              client: this.client || false,
              meta: {
                key: this.agent.key,
                method,
              },
              text,
              html,
              data,
              created: Date.now(),
            };
            this._state = this.states.answer;
            return resolve(packet);
          }).catch(err => {
            return this.error(err, packet);
          });
        }
      }
      catch(e) {
        return this.error(e);
      }
    });
  }


  // The main init interface where the chain begins.
  // a set of options is passed into the init function which is the configuration
  // object. from this opts object the system is built. After the opts object is processed
  // the inherit is assigned and then bind then listners then
  // opts: The options object containing the necessary vaules to build a Deva.
  init() {
    // set client
    this._state = this.states.init;
    return new Promise((resolve, reject) => {
      this.events.setMaxListeners(this.maxListeners);
      this._assignInherit().then(() => {
        return this._assignBind();
      }).then(() => {
        return this._assignListeners();
      }).then(() => {
        return this.onInit ? this.onInit() : this.start();
      }).then(started => {
        return resolve(started)
      }).catch(err => {
        return reject(err);
      });
    });
  }

  // Interface for unified error reporting within all devas.
  // this.error(*error*, *packet*) can be issued at time of any error.
  // e: is the error to pass into the interface.
  // packet: the packet that caused the error.
  error(err,packet=false,reject=false) {
    this._state = 'error';
    // broadcast a global uniform error event.
    this.talk('error', {
      id: this.uid(),
      agent: this.agent,
      client: this.client,
      error: err.toString('utf8'),
      data: packet,
      created: Date.now(),
    });
    // call the onError if there is a logcal one.
    // if there is no local error return a promise reject.
    if (this.onError) return this.onError(err, packet, reject);
    return reject ? reject(err) : false;
  }

  // start the deva then return the 'onStart' function.
  start() {
    if (this.active) return;
    this._state = 'start';
    this.active = Date.now();
    return this.onStart ? this.onStart() : this.enter();
  }

  // stop teh deva then return the onStop function.
  stop() {
    if (!this.active) return Promise.resolve(this.messages.offline);
    this.active = false;
    this._state = 'stop';
    return this.onStop ? this.onStop() : this.exit();
  }

  // enter the deva then return the onEnter function.
  enter() {
    if (!this.active) return Promise.resolve(this.messages.offline);
    this._state = 'enter';
    return this.onEnter ? this.onEnter() : this.done(this.state)
  }

  // exit the deva then return the onExit function.
  exit() {
    if (!this.active) return Promise.resolve(this.messages.offline);
    this._state = 'exit';
    return this.onExit ? this.onExit() : this.done(this.state)
  }

  // set the deva as done then return the oDone function.
  done(msg=false) {
    if (!this.active) return Promise.resolve(this.messages.offline);
    this._state = 'done';
    msg = msg ? msg : this.state;
    return this.onDone ? this.onDone() : Promise.resolve({msg,agent:this.agent})
  }

  // interface to return the status of the current deva with the time/date requested.
  status(addtl=false) {
    if (!this.active) return Promise.resolve(this.messages.offline);
    const id = this.uid();
    const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' }).format(this.active);
    let text = `${this.agent.name} is ONLINE since ${dateFormat}`;
    if (addtl) text = text + `\n${addtl}`;
    return Promise.resolve({text});
  }

  // universal prompt emitter
  prompt(text) {
    this.talk('prompt', {text, prompt:this.agent.prompt});
  }

  // universal hash builder
  hash(packet) {
    if (!this.vars.hash) this.vars.hash = '0x';
    // setup basic hashing
    // what type of hash depends on param 1
    return new Promise((resolve, reject) => {
      if (!packet) return reject('NO PACKET');
      const params = packet.q.text.split(' ');
      const hashType = params[0] ? params[0] : 'view';
      switch (hashType) {
        case 'clear':
          this.vars.hash = '0x';
          break;
        case 'add':
          this.vars.hash = `${this.vars.hash}${params[1]}`;
          break;
      }
      return resolve({
        text:this.vars.hash,
        html:`<div class="hash">${this.vars.hash}</div>`
      });
    });
  }
  // initDeva interface is to initialize devas that this deva is a parent of.
  // This feature allows a Deva to be a parent of a parent of a parent etc....
  initDevas() {
    return new Promise((resolve, reject) => {
      const devas = [];
      for (let x in this.devas) {
        devas.push(this.devas[x].init());
      }
      Promise.all(devas).then(() => {
        return resolve(this.messages.loaded);
      }).catch(reject);
    });
  }
  stopDevas() {
    return new Promise((resolve, reject) => {
      const devas = [];
      for (let x in this.devas) {
        devas.push(this.devas[x].stop());
      }
      Promise.all(devas).then(() => {
        return resolve(this.messages.stopped);
      }).catch(reject);
    });
  }
}
module.exports = Deva;
