// Perceptron.ts
// Simple Perceptron class for binary classification on vector data (TypeScript)
// Inspired by your C# example, adapted for use with user memory vectors

export class Perceptron {
  weights: number[];
  bias: number;
  learningRate: number;
  // Optional: emotion parameter (e.g., -1 = negative, 0 = neutral, 1 = positive)
  emotion: number;

  constructor(inputSize: number, learningRate = 0.1, emotion = 0) {
    this.learningRate = learningRate;
    this.weights = Array(inputSize)
      .fill(0)
      .map(() => Math.random() * 2 - 1); // Random between -1 and 1
    this.bias = Math.random() * 2 - 1;
    this.emotion = emotion; // Default neutral
  }

  // Set emotion (e.g., from user feedback or context)
  setEmotion(value: number) {
    this.emotion = value;
  }

  // Get emotion
  getEmotion(): number {
    return this.emotion;
  }

  // Step activation
  activate(sum: number): number {
    return sum >= 0 ? 1 : 0;
  }

  // Predict output (0 or 1)
  predict(inputs: number[]): number {
    if (inputs.length !== this.weights.length) {
      throw new Error(`Input size mismatch. Expected ${this.weights.length}, got ${inputs.length}`);
    }
    let sum = this.bias;
    for (let i = 0; i < inputs.length; i++) {
      sum += inputs[i] * this.weights[i];
    }
    return this.activate(sum);
  }

  // Train on a batch of samples
  train(trainingInputs: number[][], trainingOutputs: number[], epochs: number = 10): void {
    if (trainingInputs.length !== trainingOutputs.length) {
      throw new Error('Training data mismatch.');
    }
    for (let epoch = 0; epoch < epochs; epoch++) {
      let errors = 0;
      for (let i = 0; i < trainingInputs.length; i++) {
        const prediction = this.predict(trainingInputs[i]);
        const error = trainingOutputs[i] - prediction;
        if (error !== 0) {
          errors++;
          for (let j = 0; j < this.weights.length; j++) {
            this.weights[j] += this.learningRate * error * trainingInputs[i][j];
          }
          this.bias += this.learningRate * error;
        }
      }
      if (errors === 0) break; // Converged
    }
  }

  // Train on a single sample (with optional reinforcement)
  trainOnSingleSample(input: number[], correctOutput: number, iterations: number = 5): void {
    for (let iter = 0; iter < iterations; iter++) {
      const prediction = this.predict(input);
      const error = correctOutput - prediction;
      if (error === 0) break;
      for (let j = 0; j < this.weights.length; j++) {
        this.weights[j] += this.learningRate * error * input[j];
      }
      this.bias += this.learningRate * error;
    }
  }
}

/**
 * Usage Example:
 *
 * // Suppose you have user correction vectors and labels (1=preferred, 0=not preferred)
 * const perceptron = new Perceptron(1536); // For OpenAI embeddings
 * perceptron.train([vec1, vec2, ...], [1, 0, ...], 20);
 * // To update on a new correction:
 * perceptron.trainOnSingleSample(newVec, 1);
 * // To predict if a new message matches user preference:
 * const isPreferred = perceptron.predict(msgVec) === 1;
 */
