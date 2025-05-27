import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Dimensions, Alert, PanGestureHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTailwind } from 'tailwind-rn';
import { GameEngine } from 'react-native-game-engine';

const { width, height } = Dimensions.get('window');
const CYCLE_SIZE = 30;
const OBSTACLE_SIZE = 40;
const BOOST_SIZE = 20;
const INITIAL_CYCLE = { x: width / 2, y: height - 100, angle: 0, speed: 3 };
const TRACK_WIDTH = width - 80;

const App = () => {
  const tailwind = useTailwind();
  const [gameState, setGameState] = useState('menu');
  const [score, setScore] = useState(0);
  const [lapTime, setLapTime] = useState(0);
  const [highScores, setHighScores] = useState([]);
  const [entities, setEntities] = useState({
    cycle: { ...INITIAL_CYCLE, renderer: <Cycle /> },
    obstacles: [],
    boosts: [],
  });

  // Load high scores
  useEffect(() => {
    const loadHighScores = async () => {
      try {
        const stored = await AsyncStorage.getItem('highScores');
        if (stored) setHighScores(JSON.parse(stored));
      } catch (error) {
        console.error('Error loading high scores:', error);
      }
    };
    loadHighScores();
  }, []);

  // Save high score
  const saveHighScore = async () => {
    try {
      const newScores = [...highScores, { score, lapTime, date: new Date().toISOString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      await AsyncStorage.setItem('highScores', JSON.stringify(newScores));
      setHighScores(newScores);
    } catch (error) {
      console.error('Error saving high score:', error);
    }
  };

  // Reset high scores
  const resetHighScores = async () => {
    try {
      await AsyncStorage.setItem('highScores', JSON.stringify([]));
      setHighScores([]);
      Alert.alert('Success', 'High scores cleared!');
    } catch (error) {
      console.error('Error resetting high scores:', error);
    }
  };

  // Game systems
  const systems = {
    moveCycle: ({ entities, gestures, time }) => {
      const cycle = entities.cycle;
      gestures.forEach(gesture => {
        if (gesture.type === 'pan') {
          const { translationX } = gesture.event;
          cycle.angle += translationX * 0.05; // Steer based on swipe
        }
      });
      cycle.x += Math.cos(cycle.angle) * cycle.speed;
      cycle.y += Math.sin(cycle.angle) * cycle.speed;
      if (cycle.x < 40 || cycle.x > width - 40 - CYCLE_SIZE) {
        setGameState('gameOver');
        saveHighScore();
      }
      if (cycle.y < 0) {
        cycle.y = height;
        setLapTime(lapTime + time.current / 1000);
        setScore(score + 100); // Lap completion bonus
      } else if (cycle.y > height) {
        cycle.y = 0;
      }
      return entities;
    },
    spawnObstacles: ({ entities, time }) => {
      if (time.current % 1500 < 50) {
        entities.obstacles.push({
          x: 40 + Math.random() * (TRACK_WIDTH - OBSTACLE_SIZE),
          y: -OBSTACLE_SIZE,
          renderer: <Obstacle />,
        });
      }
      entities.obstacles = entities.obstacles.map(obstacle => ({
        ...obstacle,
        y: obstacle.y + 4,
      })).filter(obstacle => obstacle.y < height + OBSTACLE_SIZE);
      return entities;
    },
    spawnBoosts: ({ entities, time }) => {
      if (time.current % 2000 < 50) {
        entities.boosts.push({
          x: 40 + Math.random() * (TRACK_WIDTH - BOOST_SIZE),
          y: -BOOST_SIZE,
          renderer: <Boost />,
        });
      }
      entities.boosts = entities.boosts.map(boost => ({
        ...boost,
        y: boost.y + 4,
      })).filter(boost => boost.y < height + BOOST_SIZE);
      return entities;
    },
    checkCollisions: ({ entities }) => {
      const cycle = entities.cycle;
      entities.obstacles.forEach(obstacle => {
        if (
          Math.abs(cycle.x - obstacle.x) < CYCLE_SIZE &&
          Math.abs(cycle.y - obstacle.y) < CYCLE_SIZE
        ) {
          setGameState('gameOver');
          saveHighScore();
        }
      });
      entities.boosts = entities.boosts.filter(boost => {
        if (
          Math.abs(cycle.x - boost.x) < CYCLE_SIZE &&
          Math.abs(cycle.y - boost.y) < CYCLE_SIZE
        ) {
          cycle.speed = 5; // Temporary speed boost
          setScore(score + 50);
          setTimeout(() => (cycle.speed = 3), 3000);
          return false;
        }
        return true;
      });
      setScore(score + 1); // Increment score over time
      return entities;
    },
  };

  // Start game
  const startGame = () => {
    setGameState('playing');
    setScore(0);
    setLapTime(0);
    setEntities({
      cycle: { ...INITIAL_CYCLE, renderer: <Cycle /> },
      obstacles: [],
      boosts: [],
    });
  };

  // Render components
  const Cycle = () => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.cycle.x, { duration: 50 }) },
        { translateY: withTiming(entities.cycle.y, { duration: 50 }) },
        { rotate: `${entities.cycle.angle}rad` },
      ],
    }));
    return <Reanimated.View style={[tailwind('w-8 h-8 bg-cyan-400 rounded-full'), style]} />;
  };

  const Obstacle = () => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.obstacles[0]?.x || 0, { duration: 50 }) },
        { translateY: withTiming(entities.obstacles[0]?.y || 0, { duration: 50 }) },
      ],
    }));
    return <Reanimated.View style={[tailwind('w-10 h-10 bg-red-500'), style]} />;
  };

  const Boost = () => {
    const style = useAnimatedStyle(() => ({
      transform: [
        { translateX: withTiming(entities.boosts[0]?.x || 0, { duration: 50 }) },
        { translateY: withTiming(entities.boosts[0]?.y || 0, { duration: 50 }) },
      ],
    }));
    return <Reanimated.View style={[tailwind('w-5 h-5 bg-yellow-400 rounded-full'), style]} />;
  };

  // Handle gestures
  const onGestureEvent = event => {
    systems.moveCycle({ entities, gestures: [{ type: 'pan', event: event.nativeEvent }], time: { current: Date.now() } });
  };

  // Render screens
  const renderMenu = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-4xl text-cyan-400 mb-8')}>Neon Circuit Racer</Text>
      <TouchableOpacity style={tailwind('bg-cyan-500 p-4 rounded-lg mb-4')} onPress={startGame}>
        <Text style={tailwind('text-white text-lg')}>Start Race</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={tailwind('bg-gray-500 p-4 rounded-lg mb-4')}
        onPress={() => setGameState('highScores')}
      >
        <Text style={tailwind('text-white text-lg')}>Leaderboards</Text>
      </TouchableOpacity>
      <TouchableOpacity style={tailwind('bg-red-500 p-4 rounded-lg')} onPress={resetHighScores}>
        <Text style={tailwind('text-white text-lg')}>Reset Scores</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGame = () => (
    <PanGestureHandler onGestureEvent={onGestureEvent}>
      <View style={tailwind('flex-1 bg-gray-900')}>
        <GameEngine
          style={tailwind('flex-1')}
          systems={[systems.moveCycle, systems.spawnObstacles, systems.spawnBoosts, systems.checkCollisions]}
          entities={entities}
          running={gameState === 'playing'}
        />
        <View style={tailwind('absolute top-4 left-4')}>
          <Text style={tailwind('text-cyan-400 text-2xl')}>Score: {score}</Text>
          <Text style={tailwind('text-cyan-400 text-2xl')}>Lap: {Math.floor(lapTime)}s</Text>
        </View>
        <View style={tailwind('absolute top-0 left-0 w-10 h-full bg-gray-700')} />
        <View style={tailwind('absolute top-0 right-0 w-10 h-full bg-gray-700')} />
      </View>
    </PanGestureHandler>
  );

  const renderHighScores = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-3xl text-cyan-400 mb-4')}>Leaderboards</Text>
      {highScores.length ? (
        highScores.map((entry, index) => (
          <Text key={index} style={tailwind('text-lg text-white')}>
            {index + 1}. {entry.score} points ({entry.lapTime.toFixed(1)}s, {entry.date})
          </Text>
        ))
      ) : (
        <Text style={tailwind('text-lg text-white')}>No high scores yet.</Text>
      )}
      <TouchableOpacity
        style={tailwind('bg-cyan-500 p-4 rounded-lg mt-4')}
        onPress={() => setGameState('menu')}
      >
        <Text style={tailwind('text-white text-lg')}>Back to Menu</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGameOver = () => (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-900')}>
      <Text style={tailwind('text-3xl text-cyan-400 mb-4')}>Race Over!</Text>
      <Text style={tailwind('text-2xl text-white mb-8')}>
        Score: {score} | Lap: {Math.floor(lapTime)}s
      </Text>
      <TouchableOpacity style={tailwind('bg-cyan-500 p-4 rounded-lg mb-4')} onPress={startGame}>
        <Text style={tailwind('text-white text-lg')}>Race Again</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={tailwind('bg-gray-500 p-4 rounded-lg')}
        onPress={() => setGameState('menu')}
      >
        <Text style={tailwind('text-white text-lg')}>Main Menu</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={tailwind('flex-1')}>
      {gameState === 'menu' && renderMenu()}
      {gameState === 'playing' && renderGame()}
      {gameState === 'highScores' && renderHighScores()}
      {gameState === 'gameOver' && renderGameOver()}
    </View>
  );
};

export default App;
