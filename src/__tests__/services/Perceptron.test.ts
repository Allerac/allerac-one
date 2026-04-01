import { Perceptron } from '@/app/services/Perceptron';

describe('Perceptron', () => {
  let perceptron: Perceptron;

  beforeEach(() => {
    perceptron = new Perceptron(2); // 2 inputs
  });

  describe('activate()', () => {
    it('should return 1 for sum >= threshold', () => {
      const result = perceptron.activate(0.5);
      expect(result).toBe(1);
    });

    it('should return 0 for sum < threshold', () => {
      const result = perceptron.activate(-0.5);
      expect(result).toBe(0);
    });

    it('should return 1 for sum exactly at threshold (0)', () => {
      const result = perceptron.activate(0);
      expect(result).toBe(1);
    });
  });

  describe('predict()', () => {
    it('should predict AND gate correctly with trained weights', () => {
      // Train on AND gate: (0,0)=>0, (0,1)=>0, (1,0)=>0, (1,1)=>1
      const trainingInputs = [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ];
      const trainingOutputs = [0, 0, 0, 1];

      perceptron.train(trainingInputs, trainingOutputs, 100);

      // After training, predictions should match
      const predictions = trainingInputs.map(input => perceptron.predict(input));
      expect(predictions).toEqual(trainingOutputs);
    });

    it('should predict with initial random weights', () => {
      const result = perceptron.predict([0.5, 0.5]);
      expect([0, 1]).toContain(result);
    });

    it('should work with single input', () => {
      const p = new Perceptron(1);
      const result = p.predict([1]);
      expect([0, 1]).toContain(result);
    });
  });

  describe('train()', () => {
    it('should converge on linearly separable data', () => {
      const trainingInputs = [
        [0, 0],
        [1, 1],
      ];
      const trainingOutputs = [0, 1];

      perceptron.train(trainingInputs, trainingOutputs, 50);

      const predictions = trainingInputs.map(input => perceptron.predict(input));
      expect(predictions).toEqual(trainingOutputs);
    });

    it('should converge to correct prediction after training', () => {
      const trainingInputs = [
        [0, 0],
        [1, 1],
      ];
      const trainingOutputs = [0, 1];

      perceptron.train(trainingInputs, trainingOutputs, 50);

      // After training, predictions should match training data
      const predictions = trainingInputs.map((input) => perceptron.predict(input));
      expect(predictions).toEqual(trainingOutputs);
    });
  });

  describe('trainOnSingleSample()', () => {
    it('should update weights when prediction is wrong', () => {
      const input = [1, 1];
      const correctOutput = 1;

      const initialWeights = [...(perceptron as any).weights];
      perceptron.trainOnSingleSample(input, correctOutput, 10);

      // Weights should change
      const finalWeights = (perceptron as any).weights;
      const weightsChanged = initialWeights.some((w, i) => w !== finalWeights[i]);
      expect(weightsChanged).toBe(true);
    });

    it('should converge to correct prediction', () => {
      const input = [0.3, 0.7];
      const correctOutput = 1;

      perceptron.trainOnSingleSample(input, correctOutput, 100);

      const prediction = perceptron.predict(input);
      expect(prediction).toBe(correctOutput);
    });
  });

  describe('emotion getters/setters', () => {
    it('should set and get emotion value', () => {
      perceptron.setEmotion(0.8);
      expect(perceptron.getEmotion()).toBe(0.8);
    });

    it('should handle negative emotion values', () => {
      perceptron.setEmotion(-0.5);
      expect(perceptron.getEmotion()).toBe(-0.5);
    });

    it('should default emotion to 0', () => {
      expect(perceptron.getEmotion()).toBe(0);
    });
  });
});
