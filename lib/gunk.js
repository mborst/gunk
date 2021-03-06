// Copyright 2012 mbr targeting GmbH. All Rights Reserved.

var assert = require('assert');

var async = require('async');
var _ = require('lodash');

function getEnabledModules(modules, enabled, enable) {
  return enable.reduce(function(enabled, name) {
    var module = modules[name];
    var parameters = module.slice(0, -1);
    var dependencies = getDependencies(parameters);
    var next = _.difference(dependencies, enabled);
    return _.union(enabled, [name], getEnabledModules(modules, enabled, next));
  }, enabled);
}

function gunk(modules, enabledComponents_, cb_) {
  var enabledComponents;
  var cb;
  if (cb_) {
    enabledComponents = enabledComponents_;
    cb = cb_;
  } else {
    enabledComponents = null;
    cb = enabledComponents_;
  }

  var transformedModules = _.mapValues(modules, function(module) {
    var arrayModule = _.isArray(module) ? module : [module];
    return arrayModule.length === 1 && !_.isFunction(_.first(arrayModule)) ?
      arrayModule.concat(gunk.sync(_.identity)) :
      arrayModule;
  });

  var activeModules = enabledComponents ?
    getEnabledModules(transformedModules, [], enabledComponents) :
    Object.keys(transformedModules);

  var moduleObject = {};
  activeModules.forEach(function(module) {
    var injectionArgs = transformedModules[module];
    moduleObject[module] = injectDependencies.apply(null, injectionArgs);
  });
  async.auto(moduleObject, cb);
}
module.exports = gunk;

function Literal(value) {
  if (!(this instanceof Literal)) {
    return new Literal(value);
  }
  this.value = value;
}
gunk.Literal = Literal;

function ValueProvider(value) {
  if (!(this instanceof ValueProvider)) {
    return new ValueProvider(value);
  }
  this.value = value;
}
gunk.ValueProvider = ValueProvider;

function nConstructor(n) {
  var names = 'abcdefghijklmnopqrstuvwxyz'.split('').slice(0, n);
  var code = 'return new C(' + names.join(', ') + ');';
  return Function.apply(null, ['C'].concat(names, code));
}

gunk.construct = function(C /* , *additionalParameters */) {
  var additionalParameters = [].slice.call(arguments, 1);

  function create(/* *parameters, cb */) {
    var args = Array.apply(null, arguments);
    var parameters = args.slice(0, -1);
    var cb = args.slice(-1)[0];

    var object;
    try {
      var constructor = nConstructor(parameters.length);
      object = constructor.apply(null, [C].concat(parameters));
    } catch (e) {
      return cb(e);
    }
    cb(null, object);
  }

  return additionalParameters.length ? additionalParameters.concat(create) :
                                       create;
};

gunk.sync = function(f) {
  return function(/* *parameters, cb */) {
    var args = Array.apply(null, arguments);
    var parameters = args.slice(0, -1);
    var cb = args.slice(-1)[0];

    var result;
    try {
      result = f.apply(null, parameters);
    } catch (e) {
      return cb(e);
    }
    cb(null, result);
  };
};

function injectDependencies(/* *parameters, factory */) {
  var args = Array.apply(null, arguments);
  var parameters = args.slice(0, -1);
  var factory = args.slice(-1)[0];

  var dependencies = _.uniq(getDependencies(parameters));
  return dependencies.length ? dependencies.concat(callCb) : function(cb) {
    callCb({}, cb);
  };
  function callCb(resources, cb) {
    process.nextTick(function() {
      var parameterValues = getParameter(resources, parameters);
      factory.apply(null, parameterValues.concat(cb));
    });
  }
}

function getDependencies(parameter) {
  if (_.isString(parameter)) {
    return [parameter];
  } else if (parameter instanceof Literal) {
    return [];
  } else if (parameter instanceof ValueProvider) {
    return [];
  } else if (_.isArray(parameter) || isOnlyObject(parameter)) {
    return _.flatMap(parameter, getDependencies);
  } else {
    assert(false);
  }
}

function getParameter(resources, parameter) {
  function getParameter(parameter) {
    if (_.isString(parameter)) {
      return resources[parameter];
    } else if (parameter instanceof Literal) {
      return parameter.value;
    } else if (parameter instanceof ValueProvider) {
      return parameter.value();
    } else if (_.isArray(parameter)) {
      return parameter.map(getParameter);
    } else if (isOnlyObject(parameter)) {
      return _.mapValues(parameter, getParameter);
    } else {
      assert(false);
    }
  }
  return getParameter(parameter);
}

function isOnlyObject(value) {
  return _.isObject(value) && !_.isArray(value) && !_.isFunction(value);
}
